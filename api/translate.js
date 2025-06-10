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

    // Prompt melhorado para garantir tradução completa
    const systemPrompt = `Você é um tradutor profissional altamente experiente. ${styleInstructions[style || 'intelligent']}

REGRAS ABSOLUTAS - VOCÊ DEVE SEGUIR TODAS SEM EXCEÇÃO:

1. TRADUZA 100% DO TEXTO - Cada palavra, cada frase, cada parágrafo
2. NUNCA resuma, condense, abrevie ou pule NENHUMA parte
3. NUNCA use expressões como "[continua...]" ou "[resto do texto]"
4. Se o texto original tem 50 linhas, a tradução deve ter ~50 linhas
5. MANTENHA toda formatação: parágrafos, quebras de linha, listas
6. PRESERVE todos os detalhes, exemplos, repetições - TUDO
7. A tradução deve ter comprimento SIMILAR ao original
8. NÃO adicione notas sobre o processo de tradução
9. NÃO mencione que está traduzindo por partes
10. APENAS traduza - sem comentários adicionais

${partIndex !== undefined ? `ATENÇÃO: Este é o fragmento ${partIndex + 1} de ${totalParts} de um texto maior. Traduza COMPLETAMENTE este fragmento, mantendo a coerência.` : ''}

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
          content: `IMPORTANTE: Traduza TODO o texto abaixo, do início ao fim, sem pular NADA:\n\n${text}`
        }]
      })
    });

    console.log('Anthropic response status:', response.status);
    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      
      // Mensagens de erro mais claras
      let errorMessage = data.error?.message || 'Translation failed';
      
      if (response.status === 401) {
        errorMessage = 'Chave API inválida. Verifique se copiou corretamente.';
      } else if (response.status === 402) {
        errorMessage = 'Créditos insuficientes na sua conta Anthropic.';
      } else if (response.status === 429) {
        errorMessage = 'Muitas requisições. Aguarde 1 minuto e tente novamente.';
      } else if (response.status === 500) {
        errorMessage = 'Erro no servidor da Anthropic. Tente novamente.';
      }
      
      return res.status(response.status).json({ 
        error: errorMessage,
        anthropicError: data
      });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      return res.status(500).json({ 
        error: 'Invalid response from translation API' 
      });
    }

    const translation = data.content[0].text;
    console.log('Translation successful, response length:', translation.length);

    // Verificar se a tradução parece completa
    const originalLength = text.length;
    const translationLength = translation.length;
    const ratio = translationLength / originalLength;
    
    console.log(`Length ratio: ${ratio.toFixed(2)} (translation: ${translationLength}, original: ${originalLength})`);
    
    // Avisar se a tradução parece muito curta (menos de 50% do original)
    if (ratio < 0.5 && originalLength > 1000) {
      console.warn('Warning: Translation seems too short compared to original');
    }

    res.status(200).json({ 
      translation: translation,
      originalLength: originalLength,
      translationLength: translationLength,
      partIndex: partIndex,
      totalParts: totalParts
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Internal server error: ' + error.message 
    });
  }
}
