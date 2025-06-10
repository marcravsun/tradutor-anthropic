export default async function handler(req, res) {
  console.log('=== REQUEST RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Body length:', JSON.stringify(req.body).length);
  
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

    console.log('Text length:', text?.length || 0);

    if (!apiKey || !text) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: {
          hasApiKey: !!apiKey,
          hasText: !!text
        }
      });
    }

    const languageNames = {
      'auto': 'idioma original',
      'pt-BR': 'português brasileiro',
      'pt-PT': 'português de Portugal',
      'en': 'inglês',
      'es': 'espanhol',
      'fr': 'francês',
      'de': 'alemão',
      'it': 'italiano',
      'ja': 'japonês',
      'ko': 'coreano',
      'zh': 'chinês'
    };

    const styleInstructions = {
      'intelligent': `Traduza com inteligência e sensibilidade cultural, encontrando o equilíbrio perfeito entre fidelidade e naturalidade.`,
      'faithful': `Traduza de forma extremamente fiel ao texto original.`,
      'fluent': `Priorize a fluência e naturalidade no idioma de destino.`,
      'creative': `Traduza com liberdade criativa.`,
      'simplified': `Simplifique o texto durante a tradução.`,
      'formal': `Use um registro formal e profissional.`,
      'informal': `Use um tom casual e descontraído.`
    };

    const systemPrompt = `Você é um tradutor profissional. ${styleInstructions[style || 'intelligent']}

INSTRUÇÕES CRÍTICAS - VOCÊ DEVE SEGUIR TODAS:
1. Traduza o TEXTO COMPLETO, preservando TODO o conteúdo
2. NUNCA resuma, condense ou pule partes
3. Mantenha o mesmo nível de detalhe do original
4. Se o original tem 50 parágrafos, a tradução deve ter ~50 parágrafos
5. PROIBIDO criar versões resumidas
6. Traduza TUDO: cada parágrafo, cada frase, cada detalhe
7. A tradução deve ter extensão similar ao original
8. NÃO adicione notas sobre tradução parcial
9. Você DEVE traduzir até a última palavra do texto

Traduza o texto${sourceLang === 'auto' ? '' : ' do ' + languageNames[sourceLang]} para ${languageNames[targetLang]}.
Retorne APENAS a tradução completa, sem comentários.`;

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
        max_tokens: 8192,
        temperature: style === 'creative' ? 0.7 : 0.3,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Traduza COMPLETAMENTE o seguinte texto, sem pular nenhuma parte:\n\n${text}`
        }]
      })
    });

    console.log('Anthropic response status:', response.status);
    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(response.status).json({ 
        error: data.error?.message || 'Translation failed',
        anthropicError: data
      });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      return res.status(500).json({ 
        error: 'Invalid response from translation API' 
      });
    }

    console.log('Translation successful, response length:', data.content[0].text.length);

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
