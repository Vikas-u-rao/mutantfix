const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;

function requestUrl() {
  const base = (LLM_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('LLM_BASE_URL is not set');
  }
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

async function complete(prompt, { system = '', temperature = 0.2, maxTokens = 2048 } = {}) {
  const messages = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch(requestUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

module.exports = { complete };
