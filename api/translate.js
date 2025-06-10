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
    const { 
      text, 
      sourceLang, 
      targetLang, 
      style, 
      apiKey, 
      provider = 'anthropic',
      model,
      partIndex, 
      totalParts 
    } = req.body;

    console.log('Provider:', provider);
    console.log('Model:', model);
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

    const systemPrompt = `Você é um tradutor profissional altamente qualificado. ${styleInstructions[style || 'intelligent']}

INSTRUÇÕES CRÍTICAS:
1. TRADUZA 100% DO TEXTO FORNECIDO
2. NUNCA RESUMA OU PULE NADA
3. MANTENHA TODA A FORMATAÇÃO
4. PRESERVE TODOS OS DETALHES

${partIndex !== undefined ? `FRAGMENTO ${partIndex + 1} DE ${totalParts}` : ''}

Idioma de origem: ${sourceLang === 'auto' ? 'detectar automaticamente' : languageNames[sourceLang]}
Idioma de destino: ${languageNames[targetLang]}

RETORNE APENAS A TRADUÇÃO COMPLETA.`;

    let translation;
    
    // Timeout baseado no provider
    const timeoutMs = provider === 'openai' ? 9500 : 9000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (provider === 'openai') {
        // OpenAI API
        console.log('Using OpenAI API...');
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: text
              }
            ],
            temperature: style === 'creative' ? 0.7 : 0.3,
            max_tokens: 4096
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json();
          console.error('OpenAI error:', error);
          
          let errorMessage = error.error?.message || 'Translation failed';
          
          if (response.status === 401) {
            errorMessage = 'Chave API OpenAI inválida';
          } else if (response.status === 429) {
            errorMessage = 'Rate limit OpenAI - aguarde um momento';
          } else if (response.status === 402) {
            errorMessage = 'Créditos insuficientes na OpenAI';
          }
          
          return res.status(response.status).json({ 
            error: errorMessage,
            provider: 'openai'
          });
        }

        const data = await response.json();
        translation = data.choices[0].message.content;
        
      } else {
        // Anthropic API (código original)
        console.log('Using Anthropic API...');
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 8192,
            temperature: style === 'creative' ? 0.7 : 0.3,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: text
            }]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json();
          console.error('Anthropic error:', error);
          
          let errorMessage = error.error?.message || 'Translation failed';
          
          if (response.status === 401) {
            errorMessage = 'Chave API Anthropic inválida';
          } else if (response.status === 429) {
            errorMessage = 'Rate limit Anthropic - aguarde um momento';
          } else if (response.status === 402) {
            errorMessage = 'Créditos insuficientes na Anthropic';
          }
          
          return res.status(response.status).json({ 
            error: errorMessage,
            provider: 'anthropic'
          });
        }

        const data = await response.json();
        translation = data.content[0].text;
      }
      
      console.log('Translation successful, length:', translation.length);
      
      res.status(200).json({ 
        translation: translation,
        originalLength: text.length,
        translationLength: translation.length,
        partIndex: partIndex,
        totalParts: totalParts,
        success: true,
        provider: provider
      });

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error('Request timeout');
        return res.status(504).json({ 
          error: 'Timeout - texto muito complexo para o tempo limite',
          timeout: true,
          provider: provider
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
