
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const validationCache: Record<string, { syntaxValid: boolean; semanticsValid: boolean; feedback: string }> = {};

export interface WordCategoryMapping {
  text: string;
  category: string;
}

export interface ValidationResult {
  syntaxValid: boolean;
  semanticsValid: boolean;
  feedback: string;
}

/**
 * Validates if a sentence follows grammar rules and has semantic coherence.
 * Highly rigorous with syntax/classification and generous with semantics.
 */
export async function validateSentence(
  words: WordCategoryMapping[], 
  targetStructure: string, 
  isDangerZone: boolean = false
): Promise<ValidationResult> {
  const sentence = words.map(w => w.text).join(" ");
  const categoriesSeq = words.map(w => w.category).join(" -> ");
  const cacheKey = `${sentence.toLowerCase()}|${categoriesSeq}|${targetStructure.toLowerCase()}|${isDangerZone}`;
  
  if (validationCache[cacheKey]) {
    return validationCache[cacheKey];
  }

  try {
    const instruction = isDangerZone 
      ? "O JOGADOR ESTÁ QUASE PERDENDO. Se a estrutura gramatical básica estiver correta, ignore problemas de sentido absurdo."
      : "Seja um professor de gramática extremamente rigoroso. O jogador é um aprendiz e não deve ser confundido.";

    const prompt = `
      Você é um validador de frases para um jogo educativo de gramática portuguesa.
      
      CONTEXTO:
      No jogo, as palavras são coloridas por categoria:
      - Azul: Sujeito
      - Rosa: Verbo
      - Verde: Objeto
      - Âmbar: Adjetivo
      - Roxo: Advérbio
      - Laranja: Conjunção
      - Ciano: Preposição

      FRASE PARA ANALISAR: "${sentence}"
      CLASSIFICAÇÃO DO JOGADOR (Palavra -> Categoria):
      ${words.map(w => `- "${w.text}" foi marcada como "${w.category}"`).join('\n')}
      
      META ESTRUTURAL DO NÍVEL: "${targetStructure}"
      
      DIRETRIZES DE VALIDAÇÃO:
      1. SINTAXE E CLASSIFICAÇÃO (Rigor Máximo): 
         - A frase deve ter concordância verbal e nominal perfeita.
         - Cada palavra deve REALMENTE pertencer à categoria gramatical que o jogador atribuiu no contexto da frase.
         - Se houver erro de concordância ou erro de classificação de classe gramatical, 'syntaxValid' deve ser false.
      2. SEMÂNTICA (Flexibilidade Generosa): 
         - Aceite frases surreais ou engraçadas desde que a gramática esteja impecável. 'semanticsValid' deve ser true nesses casos.
      3. PEDAGOGIA: Forneça um feedback curto (máximo 15 palavras) explicando o erro gramatical específico ou elogiando a estrutura.
      4. ${instruction}

      Responda EXCLUSIVAMENTE em JSON: 
      {
        "syntaxValid": boolean, 
        "semanticsValid": boolean, 
        "feedback": "Sua explicação pedagógica aqui"
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            syntaxValid: { type: Type.BOOLEAN },
            semanticsValid: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING }
          },
          required: ["syntaxValid", "semanticsValid", "feedback"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"syntaxValid":false, "semanticsValid":false, "feedback":"Erro técnico na análise."}');
    validationCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.error("AI Validation Error:", error);
    return { syntaxValid: true, semanticsValid: true, feedback: "A IA tropeçou, mas sua frase parece ok!" };
  }
}

/**
 * Suggests a word that completes a sentence based on existing words in a row.
 */
export async function suggestContextualWord(
  existingWords: string[], 
  targetCategory: string,
  targetStructure: string
): Promise<string | null> {
  try {
    const context = existingWords.map(w => w || "[LACUNA]").join(" ");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Complete a oração em português: "${context}". O termo na [LACUNA] deve ser estritamente da categoria "${targetCategory}" para respeitar a estrutura "${targetStructure}". Forneça apenas UM termo criativo.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedWord: { type: Type.STRING }
          },
          required: ["suggestedWord"]
        }
      }
    });

    const data = JSON.parse(response.text);
    return data.suggestedWord;
  } catch (e) {
    return null;
  }
}

/**
 * Checks if a player name is appropriate, specifically blocking vulgar puns,
 * cacophony, and double meanings in Portuguese.
 */
export async function checkNameAppropriateness(name: string): Promise<{ isAppropriate: boolean; reason?: string }> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Analise o nome de jogador: "${name}".
        Este é um jogo escolar educativo. Você deve detectar e bloquear:
        1. Palavrões explícitos.
        2. Trocadilhos de duplo sentido (Ex: nomes que lidos rápido soam como obscenidades - cacofonia).
        3. Linguagem vulgar, grosseira ou ofensiva disfarçada.
        
        Exemplos de nomes PROIBIDOS por cacofonia/duplo sentido em português: 'Cuca Beludo', 'Paula Tejano', 'Jacinto Leite', etc.
        
        Responda em JSON.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isAppropriate: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          },
          required: ["isAppropriate"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    return { isAppropriate: true };
  }
}
