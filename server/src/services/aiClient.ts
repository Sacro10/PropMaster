import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

type AiProvider = 'openai' | 'anthropic';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20240620';
const OPENAI_KEY_ENV_KEYS = ['OPENAI_API_KEY', 'VITE_OPENAI_API_KEY'] as const;
const ANTHROPIC_KEY_ENV_KEYS = ['ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'] as const;
const MODEL_ENV_KEYS = ['AI_MODEL_NAME', 'VITE_AI_MODEL_NAME'] as const;

export class AiDisabledError extends Error {
  missingEnvVars: string[];
  fallbackText: string;
  fallbackJson: Record<string, unknown>;

  constructor(message: string, missingEnvVars: string[]) {
    super(message);
    this.name = 'AiDisabledError';
    this.missingEnvVars = missingEnvVars;
    this.fallbackText = '';
    this.fallbackJson = { disabled: true };
  }
}

function getProvider(): {
  provider: AiProvider | null;
  modelName: string;
  openAiKey?: string;
  anthropicKey?: string;
} {
  const openAiKey = readEnvValue(OPENAI_KEY_ENV_KEYS);
  const anthropicKey = readEnvValue(ANTHROPIC_KEY_ENV_KEYS);
  const modelNameFromEnv = readEnvValue(MODEL_ENV_KEYS);

  if (openAiKey) {
    return {
      provider: 'openai',
      modelName: modelNameFromEnv || DEFAULT_OPENAI_MODEL,
      openAiKey,
      anthropicKey,
    };
  }

  if (anthropicKey) {
    return {
      provider: 'anthropic',
      modelName: modelNameFromEnv || DEFAULT_ANTHROPIC_MODEL,
      openAiKey,
      anthropicKey,
    };
  }

  return {
    provider: null,
    modelName: modelNameFromEnv || DEFAULT_OPENAI_MODEL,
    openAiKey,
    anthropicKey,
  };
}

function readEnvValue(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function getAiStatus() {
  const { provider } = getProvider();
  const missingEnvVars =
    provider === null ? [...OPENAI_KEY_ENV_KEYS, ...ANTHROPIC_KEY_ENV_KEYS] : [];

  return {
    enabled: provider !== null,
    provider,
    missingEnvVars,
  };
}

function ensureEnabled(): ReturnType<typeof getProvider> {
  const config = getProvider();
  if (!config.provider) {
    const error = new AiDisabledError(
      'AI is disabled: set OPENAI_API_KEY (or VITE_OPENAI_API_KEY) or ANTHROPIC_API_KEY (or VITE_ANTHROPIC_API_KEY) to enable.',
      [...OPENAI_KEY_ENV_KEYS, ...ANTHROPIC_KEY_ENV_KEYS]
    );
    throw error;
  }
  return config;
}

export async function generateText(
  instructions: string,
  input: any
): Promise<string> {
  const { provider, modelName, openAiKey, anthropicKey } = ensureEnabled();
  const userContent = JSON.stringify(input ?? {});

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey: openAiKey });
    const response = await client.chat.completions.create({
      model: modelName,
      temperature: 0.2,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: userContent },
      ],
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  const client = new Anthropic({ apiKey: anthropicKey });
  const response = await client.messages.create({
    model: modelName,
    max_tokens: 1024,
    system: instructions,
    messages: [{ role: 'user', content: userContent }],
  });

  const content = response.content.find((item) => item.type === 'text');
  return content?.text?.trim() || '';
}

export async function generateStructuredJson<T>(
  instructions: string,
  input: any
): Promise<T> {
  const { provider, modelName, openAiKey, anthropicKey } = ensureEnabled();
  const userContent = JSON.stringify(input ?? {});

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey: openAiKey });
    const response = await client.chat.completions.create({
      model: modelName,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${instructions}\nReturn only JSON that matches the requested shape.`,
        },
        { role: 'user', content: userContent },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    return JSON.parse(content) as T;
  }

  const client = new Anthropic({ apiKey: anthropicKey });
  const response = await client.messages.create({
    model: modelName,
    max_tokens: 1024,
    system: `${instructions}\nReturn only JSON that matches the requested shape.`,
    messages: [{ role: 'user', content: userContent }],
  });

  const content = response.content.find((item) => item.type === 'text');
  const text = content?.text?.trim() || '{}';
  return JSON.parse(text) as T;
}
