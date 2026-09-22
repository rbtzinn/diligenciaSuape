// ==========================================================
// DILIGÊNCIA 360 — Demais campos do Questionário de Diligência
//
// A transcrição por IA traz o que consegue ler. O que ela não traz cai
// aqui, para o analista completar antes de mandar para a planilha.
//
// Sem esta tela, campo que a IA pulou ficava sem nenhuma forma de ser
// preenchido — a CheckList ia ao processo com buraco e não havia o que
// fazer a respeito. Com ela, "questionário completo" deixa de depender
// de a IA acertar tudo.
//
// O que esta tela NÃO faz: sugerir, completar ou deduzir valor. Campo em
// branco continua em branco até alguém escrever. Num documento que vai
// ao processo, um "provavelmente é isso" vale menos que um vazio
// honesto, porque o vazio se vê e o palpite não.
// ==========================================================

import React from 'react';
import { Section } from '../../../components/ui/Section';
import { Chip } from '../../../components/ui/Chip';
import { TextField } from '../../../components/ui/Field';
import { Note } from '../../../components/ui/Note';
import { cn } from '../../../lib/cn';
import {
  SUAPE_EXTRA_CHOICES,
  SUAPE_TEXT_FIELDS,
  type SuapeExtraChoiceKey,
  type SuapeTextFieldKey,
} from '../utils/suapeChecklistFields';
import type { ChecklistExtras } from '../utils/integrityFormPayload';

interface ChecklistExtrasPanelProps {
  extras: ChecklistExtras;
  onChange: (extras: ChecklistExtras) => void;
}

/** Máscara do campo, quando o formato é fixo. */
const MASCARAS: Partial<Record<SuapeTextFieldKey, 'cpf' | 'phone' | 'year'>> = {
  representanteCpf: 'cpf',
  representanteTelefone: 'phone',
};

/** Campos que rendem texto longo e merecem caixa maior. */
const LONGOS: SuapeTextFieldKey[] = [
  'subcontratacaoDetalhe',
  'historicoSociedade',
  'processosCorrupcao',
  'processosCriminais',
  'controleExterno',
  'cadastrosDetalhe',
];

export const ChecklistExtrasPanel: React.FC<ChecklistExtrasPanelProps> = ({ extras, onChange }) => {
  const choices = extras?.choices || {};
  const texts = extras?.texts || {};

  const preenchidos =
    SUAPE_EXTRA_CHOICES.filter((item) => choices[item.key] === true || choices[item.key] === false).length
    + SUAPE_TEXT_FIELDS.filter((campo) => String(texts[campo.key] || '').trim()).length;
  const total = SUAPE_EXTRA_CHOICES.length + SUAPE_TEXT_FIELDS.length;
  const faltando = total - preenchidos;

  const setChoice = (key: SuapeExtraChoiceKey, value: boolean | null) => {
    onChange({ choices: { ...choices, [key]: value }, texts });
  };

  const setText = (key: SuapeTextFieldKey, value: string) => {
    onChange({ choices, texts: { ...texts, [key]: value } });
  };

  return (
    <Section
      title="Demais campos do questionário"
      subtitle="Completam a CheckList na planilha. Não entram no cálculo da classificação."
      collapsible
      defaultOpen={false}
      trailing={
        <Chip size="sm" tone={faltando === 0 ? 'ok' : 'warn'}>
          {preenchidos}/{total}
        </Chip>
      }
    >
      {faltando > 0 ? (
        <Note>
          {faltando} campo(s) ainda em branco. Se estiverem em branco no questionário do terceiro,
          deixe assim — a CheckList registra a ausência, que é informação. Preencha o que a
          transcrição deixou passar.
        </Note>
      ) : null}

      <div className="mt-3 space-y-2">
        {SUAPE_EXTRA_CHOICES.map((item) => {
          const valor = choices[item.key];
          return (
            <div
              key={item.key}
              className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--control-radius-md)] border border-line bg-surface px-3 py-2"
            >
              <span className="min-w-0 text-xs text-ink" title={item.text}>
                <span className="font-semibold text-ink-3">{item.key}</span>{' '}
                <span className="line-clamp-2">{item.text}</span>
              </span>

              <div
                role="group"
                aria-label={item.text}
                className="flex shrink-0 overflow-hidden rounded-[var(--control-radius-sm)] border border-line"
              >
                {([
                  ['Sim', true],
                  ['Não', false],
                  ['—', null],
                ] as const).map(([rotulo, opcao]) => (
                  <button
                    key={rotulo}
                    type="button"
                    aria-pressed={valor === opcao}
                    onClick={() => setChoice(item.key, opcao)}
                    className={cn(
                      'min-h-[var(--control-height-sm)] px-3 text-xs font-semibold transition-colors',
                      valor === opcao
                        ? 'bg-brand text-white'
                        : 'bg-surface text-ink-3 hover:bg-surface-hover',
                    )}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {SUAPE_TEXT_FIELDS.map((campo) => (
          <TextField
            key={campo.key}
            label={campo.label}
            controlSize="sm"
            hint={campo.text}
            mask={MASCARAS[campo.key]}
            value={texts[campo.key] || ''}
            onChange={(event) => setText(campo.key, event.target.value)}
            fieldClassName={LONGOS.includes(campo.key) ? 'sm:col-span-2' : undefined}
          />
        ))}
      </div>
    </Section>
  );
};
