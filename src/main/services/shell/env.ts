import { existsSync } from 'node:fs';
import { getSetting, SETTING_KEYS } from '../settings.js';

export interface ShellConfig {
  shellPath: string;
  shellName: string;
}

export async function resolveShell(): Promise<ShellConfig> {
  const configured = await getSetting(SETTING_KEYS.SHELL_PATH);
  let shellPath: string;

  if (configured && existsSync(configured)) {
    shellPath = configured;
  } else {
    shellPath = process.env.SHELL ?? '/bin/bash';
    if (!existsSync(shellPath)) {
      shellPath = '/bin/bash';
      if (!existsSync(shellPath)) {
        shellPath = '/bin/sh';
      }
    }
  }

  const shellName = shellPath.split('/').pop() ?? 'sh';
  return { shellPath, shellName };
}

export function buildShellArgs(shellName: string, command: string): string[] {
  switch (shellName) {
    case 'bash':
    case 'zsh':
    case 'sh':
    case 'dash':
    case 'ksh':
      return ['-l', '-c', command];
    case 'fish':
      return ['-c', command];
    case 'pwsh':
    case 'powershell':
      return ['-NoProfile', '-NonInteractive', '-Command', command];
    default:
      return ['-c', command];
  }
}
