import test from 'node:test';
import assert from 'node:assert/strict';
import { prompts, answers } from './cards.js';
import { mostLikelyPrompts } from './most-likely.js';
test('hay consignas y cartas suficientes para una partida de 10 jugadores', () => {
  assert.ok(prompts.length >= 16);
  assert.ok(answers.length >= 50);
  assert.ok(answers.every(a => a.length <= 200 && a.length > 0));
  assert.equal(new Set(answers).size,answers.length);
});
test('la modalidad Mala Junta tiene consignas únicas y respeta los temas excluidos', () => {
  assert.ok(mostLikelyPrompts.length >= 100);
  assert.equal(new Set(mostLikelyPrompts).size,mostLikelyPrompts.length);
  assert.ok(mostLikelyPrompts.every(prompt => prompt.startsWith('¿Quién es más probable')));
  assert.ok(mostLikelyPrompts.every(prompt => !/suicid|aborto|violaci[oó]n/i.test(prompt)));
});
