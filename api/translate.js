export default async function handler(req, res) {
  console.log('=== REQUEST RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body));
  
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

    console.log('Extracted values:', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length,
      firstChars: apiKey?.substring(0, 20) + '...',
      hasText: !!text,
      textLength: text?.length
    });

    if (!apiKey || !text) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: {
          hasApiKey: !!apiKey,
          hasText: !!text
        }
      });
    }

    console.log('Making request to Anthropic...');

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

    console.log('Anthropic response status:', response.status);
    const data = await response.json();
    console.log('Anthropic response:', JSON.stringify(data).substring(0, 200));

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || 'Translation failed',
        anthropicError: data
      });
    }

    res.status(200).json({ 
      translation: data.content[0].text 
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Internal server error: ' + error.message 
    });
  }
}
