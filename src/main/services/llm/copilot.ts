import { CopilotClient } from '@github/copilot-sdk';
import type { ModelInfo as CopilotModelInfo } from '@github/copilot-sdk';
import { logger } from '../logger.js';
import { getSetting, SETTING_KEYS } from '../settings.js';
import { COPILOT_CLI_URL } from '@shared/constants';
import type { ModelInfo } from './provider.js';

const log = logger.child({ mod: 'copilot' });

/**
 * Singleton service wrapping the Copilot SDK client.
 * Connects to an already-running Copilot CLI server via TCP.
 */
export class CopilotService {
  private client: CopilotClient | null = null;
  private connecting: Promise<void> | null = null;
  private lastUrl: string | null = null;

  /** Get (or lazily connect to) the CopilotClient. */
  async getClient(): Promise<CopilotClient> {
    const url = (await getSetting(SETTING_KEYS.COPILOT_CLI_URL)) ?? COPILOT_CLI_URL;
    // Reconnect if the URL changed
    if (this.client && this.lastUrl === url) return this.client;
    if (this.connecting) {
      await this.connecting;
      return this.client!;
    }
    this.connecting = this.doConnect(url);
    await this.connecting;
    return this.client!;
  }

  private async doConnect(url: string): Promise<void> {
    log.info({ url }, 'connecting to Copilot CLI server...');
    const client = new CopilotClient({
      cliUrl: url,
      logLevel: 'warning',
    });
    await client.start();
    this.client = client;
    this.lastUrl = url;
    this.connecting = null;
    log.info({ url }, 'connected to Copilot CLI server');
  }

  async ping(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.ping();
      return true;
    } catch (err) {
      log.debug({ err }, 'copilot ping failed');
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const client = await this.getClient();
      const models: CopilotModelInfo[] = await client.listModels();
      return models.map((m) => ({
        name: m.id,
        sizeBytes: undefined,
        modifiedAt: undefined,
      }));
    } catch (err) {
      log.warn({ err }, 'copilot listModels failed');
      return [];
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      log.info('disconnecting from Copilot CLI server...');
      try {
        await this.client.stop();
      } catch (err) {
        log.warn({ err }, 'copilot disconnect error');
      }
      this.client = null;
      this.connecting = null;
      this.lastUrl = null;
    }
  }
}

let _instance: CopilotService | null = null;

export function getCopilotService(): CopilotService {
  if (!_instance) _instance = new CopilotService();
  return _instance;
}
