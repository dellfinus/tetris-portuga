
import { BlockCategory } from './types';

export const GRID_WIDTH = 4;
export const GRID_HEIGHT = 12;
export const INITIAL_SPEED = 800;
export const MIN_SPEED = 200;

export const CATEGORY_COLORS: Record<BlockCategory, string> = {
  subject: 'bg-blue-600 border-blue-400',
  verb: 'bg-rose-600 border-rose-400',
  object: 'bg-emerald-600 border-emerald-400',
  adjective: 'bg-amber-600 border-amber-400',
  adverb: 'bg-purple-600 border-purple-400',
  conjunction: 'bg-orange-600 border-orange-400',
  preposition: 'bg-cyan-600 border-cyan-400',
};

export const WORD_POOLS: Record<number, Record<BlockCategory, string[]>> = {
  1: {
    subject: ['O gato', 'A menina', 'O sol', 'Meu amigo', 'A professora', 'O cachorro', 'O pássaro', 'A chuva', 'O atleta', 'A flor'],
    verb: ['corre', 'brilha', 'canta', 'pula', 'estuda', 'dorme', 'voa', 'cai', 'treina', 'cresce'],
    adjective: ['feliz', 'rápido', 'bonito', 'cansado', 'atento', 'calmo', 'azul', 'frio', 'forte', 'linda'],
    object: ['o leite', 'a bola', 'o livro', 'a maçã', 'o prêmio', 'a nota', 'o mar', 'a rua', 'o gramado', 'o céu'],
    adverb: ['hoje', 'ontem', 'agora', 'cedo', 'tarde', 'aqui', 'lá', 'sempre', 'nunca', 'muito'],
    conjunction: ['e', 'mas', 'ou', 'pois', 'então', 'porque', 'contudo', 'entretanto', 'logo', 'se'],
    preposition: ['com', 'de', 'para', 'em', 'por', 'sobre', 'sob', 'ante', 'após', 'até']
  },
  2: {
    subject: ['Nós', 'Eles', 'O autor', 'A equipe', 'A criança', 'O cientista', 'O cozinheiro', 'O músico', 'O piloto'],
    verb: ['comprou', 'leu', 'fez', 'encontrou', 'viu', 'escreveu', 'preparou', 'ouviu', 'guiou'],
    object: ['o livro', 'uma maçã', 'o tesouro', 'a carta', 'o caminho', 'um artigo', 'o jantar', 'a nota', 'o avião'],
    adjective: ['antigo', 'doce', 'longo', 'secreto', 'claro', 'novo', 'saboroso', 'alto', 'seguro'],
    adverb: ['lentamente', 'rapidamente', 'silenciosamente', 'cuidadosamente', 'totalmente', 'parcialmente'],
    conjunction: ['conforme', 'embora', 'visto que', 'portanto', 'todavia', 'conquanto'],
    preposition: ['perante', 'mediante', 'durante', 'consoante', 'exceto', 'fora']
  }
};

export const TARGET_STRUCTURES = [
  "Sujeito + Verbo + Objeto + Adjetivo",
  "Advérbio + Sujeito + Verbo + Objeto",
  "Sujeito + Verbo + Objeto + Advérbio",
  "Preposição + Sujeito + Verbo + Objeto"
];
