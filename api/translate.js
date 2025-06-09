export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, sourceLang, targetLang, style, apiKey } = req.body;

    if (!apiKey || !text) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.3,
        system: `Traduza o texto para ${targetLang === 'pt-BR' ? 'português brasileiro' : targetLang === 'en' ? 'inglês' : targetLang}. Retorne apenas a tradução.`,
        messages: [{
          role: 'user',
          content: text
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || 'Translation failed' 
      });
    }

    res.status(200).json({ 
      translation: data.content[0].text 
    });

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
}
