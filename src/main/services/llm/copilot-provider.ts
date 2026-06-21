import { COPILOT_CLI_URL, DEFAULT_COPILOT_MODEL } from '@shared/constants';
import { CopilotClient, type SessionEvent } from '@github/copilot-sdk';
import { BaseLLMProvider } from './provider.js';
import type { ChatOptions, ChatResult, ModelInfo } from './provider.js';
import { getSetting, SETTING_KEYS } from '../settings.js';
import { logger } from '../logger.js';
import { resolvePermissionRequest } from '../copilot/permissionRequests.js';
import { resolveUserInputRequest } from '../copilot/userInputRequests.js';
import { bridgeEvent } from '../copilot/events.js';

const log = logger.child({ mod: 'copilot' });

export class CopilotProvider extends BaseLLMProvider {
  readonly id = 'copilot';
  readonly label = 'GitHub Copilot';

  private lastUrl: string | null = null;
  private clientInstance: CopilotClient | null = null;

  private async client(): Promise<CopilotClient> {
    const url = await getSetting(SETTING_KEYS.COPILOT_CLI_URL, COPILOT_CLI_URL);

    // Reuse existing client if URL hasn't changed
    if (this.clientInstance && this.lastUrl === url) {
      return this.clientInstance;
    }

    try {
      log.info('connecting to Copilot CLI server...');
      const client = new CopilotClient({
        cliUrl: url,
        logLevel: 'warning',
      });
      log.info('starting Copilot CLI client...');
      await client.start();
      log.info('Connected to Copilot CLI server at %s', url);

      this.clientInstance = client;
      this.lastUrl = url;

      return client;
    } catch (err) {
      log.error({ err, url }, 'Failed to connect to Copilot CLI server');
      throw err;
    }
  }

  async url(): Promise<string> {
    return await getSetting(SETTING_KEYS.COPILOT_CLI_URL, COPILOT_CLI_URL);
  }

  async ping(): Promise<boolean> {
    try {
      const client = await this.client();
      await client.ping();
      return true;
    } catch (err) {
      log.error({ err }, 'copilot ping failed');
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const client = await this.client();
      const models = await client.listModels();
      return models.map((m) => ({
        name: m.id,
        sizeBytes: undefined,
        modifiedAt: undefined,
      }));
    } catch (err) {
      log.error({ err }, 'copilot listModels failed');
      return [];
    }
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    const client = await this.client();

    const chunks: string[] = [];
    const thinkingChunks: string[] = [];

    const messages = opts.messages;
    const systemMessage = messages
      .filter((item) => item.role === 'system')
      .map((item) => item.content)
      .join('\n\n');
    const userMessages = messages
      .filter((item) => item.role !== 'system')
      .map((item) => [item.role, item.content].join(': '))
      .join('\n\n');

    const taskId = opts.taskId;
    const signal = opts.signal;
    const model =
      opts.model ?? (await getSetting(SETTING_KEYS.PRIMARY_MODEL, DEFAULT_COPILOT_MODEL));
    const workingDirectory = opts.workingDirectory ?? process.cwd();

    const session = await client.createSession({
      model: opts.model ?? model,
      workingDirectory,
      streaming: true,
      systemMessage: { mode: 'append', content: systemMessage },
      onPermissionRequest: (request) => resolvePermissionRequest({ taskId, request, signal }),
      onUserInputRequest: (request) => resolveUserInputRequest({ taskId, request, signal }),
      onEvent: async (event: SessionEvent) => {
        if (event.type === 'assistant.message_delta') {
          const text = event.data.deltaContent;
          chunks.push(text);
        } else if (event.type === 'assistant.reasoning_delta') {
          const text = event.data.deltaContent;
          thinkingChunks.push(text);
        }
        // Process events
        await bridgeEvent(taskId, event);
      },
    });

    try {
      await session.sendAndWait({ prompt: userMessages }, opts.timeout);
      const content = chunks.join('');
      const thinking = thinkingChunks.join('');
      return {
        model: opts.model ?? model,
        content,
        thinking: thinking || undefined,
        toolCalls: [],
      };
    } finally {
      await session.disconnect();
    }
  }

  async disconnect(): Promise<void> {
    log.info('Disconnecting from Copilot CLI server...');
    try {
      if (this.clientInstance) {
        await this.clientInstance.stop();
        this.lastUrl = null;
        this.clientInstance = null;
      }
    } catch (err) {
      log.error({ err }, 'copilot disconnect error');
    }
  }
}
