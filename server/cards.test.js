import test from 'node:test';
import assert from 'node:assert/strict';
import { prompts, answers, promptTheme, compatibleAnswerIndices } from './cards.js';
import { mostLikelyPrompts } from './most-likely.js';
import { trialCases } from './trial-cases.js';
test('hay consignas y cartas suficientes para una partida de 10 jugadores', () => {
  assert.ok(prompts.length >= 16);
  assert.ok(answers.length >= 50);
  assert.ok(answers.every(a => a.length <= 200 && a.length > 0));
  assert.equal(new Set(answers).size,answers.length);
});
test('cada consigna reparte una mano completa desde un mazo temáticamente compatible', () => {
  for (const prompt of prompts) {
    const compatible = compatibleAnswerIndices(prompt);
    assert.ok(['social','macabre','crime','adult'].includes(promptTheme(prompt)));
    assert.ok(compatible.length >= 50, `faltan respuestas compatibles para: ${prompt}`);
    assert.equal(new Set(compatible).size,compatible.length);
    assert.ok(compatible.every(index => Number.isInteger(index) && answers[index]));
  }
});
test('la modalidad Mala Junta tiene consignas únicas y respeta los temas excluidos', () => {
  assert.ok(mostLikelyPrompts.length >= 100);
  assert.equal(new Set(mostLikelyPrompts).size,mostLikelyPrompts.length);
  assert.ok(mostLikelyPrompts.every(prompt => prompt.startsWith('¿Quién es más probable')));
  assert.ok(mostLikelyPrompts.every(prompt => !/suicid|aborto|violaci[oó]n/i.test(prompt)));
});
test('El Juzgado tiene casos únicos y cuatro o más defensas disponibles', () => {
  assert.ok(trialCases.length >= 50);
  assert.equal(new Set(trialCases).size,trialCases.length);
  assert.ok(answers.length >= 4);
  assert.ok(trialCases.every(trialCase => !/suicid|aborto|violaci[oó]n/i.test(trialCase)));
});
