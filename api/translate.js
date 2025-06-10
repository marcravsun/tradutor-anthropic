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
    const { text, sourceLang, targetLang, style, apiKey, partIndex, totalParts } = req.body;

    console.log('Text length:', text?.length || 0);
    if (partIndex !== undefined) {
      console.log(`Processing part ${partIndex + 1} of ${totalParts}`);
    }

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

    // Prompt ainda mais rigoroso para garantir tradução completa
    const systemPrompt = `Você é um tradutor profissional altamente qualificado. ${styleInstructions[style || 'intelligent']}

INSTRUÇÕES CRÍTICAS - VOCÊ DEVE SEGUIR TODAS:

1. TRADUZA 100% DO TEXTO FORNECIDO
2. NUNCA RESUMA, NUNCA PULE NADA
3. CADA PALAVRA DEVE SER TRADUZIDA
4. SE O TEXTO TEM 1000 PALAVRAS, A TRADUÇÃO DEVE TER ~1000 PALAVRAS
5. MANTENHA TODOS OS DETALHES
6. PRESERVE TODA A FORMATAÇÃO
7. NÃO ADICIONE COMENTÁRIOS SOBRE A TRADUÇÃO
8. APENAS TRADUZA, NADA MAIS

${partIndex !== undefined ? `ESTE É O FRAGMENTO ${partIndex + 1} DE ${totalParts}. TRADUZA TODO ESTE FRAGMENTO.` : ''}

Idioma de origem: ${sourceLang === 'auto' ? 'detectar automaticamente' : languageNames[sourceLang]}
Idioma de destino: ${languageNames[targetLang]}

RETORNE APENAS A TRADUÇÃO COMPLETA.`;

    console.log('Making request to Anthropic...');
    console.log('Fragment size:', text.length, 'characters');

    // Timeout de 9 segundos (deixando 1s de margem para o Vercel)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
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
            content: `Traduza TODO o texto abaixo. NÃO PULE NADA. TRADUZA CADA PALAVRA:\n\n${text}`
          }]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('Anthropic response status:', response.status);
      const data = await response.json();

      if (!response.ok) {
        console.error('Anthropic error:', data);
        
        let errorMessage = data.error?.message || 'Translation failed';
        
        if (response.status === 401) {
          errorMessage = 'Chave API inválida';
        } else if (response.status === 402) {
          errorMessage = 'Créditos insuficientes';
        } else if (response.status === 429) {
          errorMessage = 'Rate limit - aguarde antes de continuar';
        } else if (response.status === 500) {
          errorMessage = 'Erro no servidor da Anthropic';
        }
        
        return res.status(response.status).json({ 
          error: errorMessage,
          status: response.status
        });
      }

      if (!data.content || !data.content[0] || !data.content[0].text) {
        return res.status(500).json({ 
          error: 'Invalid response from API' 
        });
      }

      const translation = data.content[0].text;
      console.log('Translation successful, response length:', translation.length);

      // Log detalhado para debug
      const ratio = translation.length / text.length;
      console.log(`Length ratio: ${ratio.toFixed(2)}`);
      console.log(`Original: ${text.length} chars`);
      console.log(`Translation: ${translation.length} chars`);
      
      if (ratio < 0.5 && text.length > 500) {
        console.warn('WARNING: Translation seems too short!');
      }

      res.status(200).json({ 
        translation: translation,
        originalLength: text.length,
        translationLength: translation.length,
        partIndex: partIndex,
        totalParts: totalParts,
        success: true
      });

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error('Request timeout after 9 seconds');
        return res.status(504).json({ 
          error: 'Timeout - o texto é muito grande para o tempo limite',
          timeout: true
        });
      }
      
      throw error;
    }

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
