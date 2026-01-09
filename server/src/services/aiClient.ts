import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

type AiProvider = 'openai' | 'anthropic';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20240620';

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
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (openAiKey) {
    return {
      provider: 'openai',
      modelName: process.env.AI_MODEL_NAME || DEFAULT_OPENAI_MODEL,
      openAiKey,
      anthropicKey,
    };
  }

  if (anthropicKey) {
    return {
      provider: 'anthropic',
      modelName: process.env.AI_MODEL_NAME || DEFAULT_ANTHROPIC_MODEL,
      openAiKey,
      anthropicKey,
    };
  }

  return {
    provider: null,
    modelName: process.env.AI_MODEL_NAME || DEFAULT_OPENAI_MODEL,
    openAiKey,
    anthropicKey,
  };
}

export function getAiStatus() {
  const { provider } = getProvider();
  const missingEnvVars =
    provider === null ? ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'] : [];

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
      'AI is disabled: set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable.',
      ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']
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
