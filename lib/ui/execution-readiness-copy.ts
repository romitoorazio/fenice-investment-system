const exactTranslations: Record<string, string> = {
  "execution evidence is missing or older than 30 minutes":
    "L’evidenza execution è assente o più vecchia di 30 minuti.",
  "execution coverage does not match the evidence snapshot":
    "La copertura execution non corrisponde allo snapshot di evidenza.",
  "execution evidence schema is legacy or incomplete":
    "Lo schema dell’evidenza execution è precedente o incompleto.",
  "provider-neutral PAPER safety policy is not fully enforced":
    "La policy di sicurezza PAPER indipendente dal provider non è applicata integralmente.",
};

export function executionReadinessCopy(message: string | null | undefined): string | null {
  if (!message) return null;

  const exact = exactTranslations[message];
  if (exact) return exact;

  const provenance = message.match(/^(\d+) PAPER\/LIVE observation\(s\) lack verified provenance$/);
  if (provenance) return `${provenance[1]} osservazioni PAPER/LIVE non hanno provenienza verificata.`;

  const redundancy = message.match(/^verified PAPER source redundancy is (\d+)\/(\d+)$/);
  if (redundancy) return `La ridondanza verificata delle fonti PAPER è ${redundancy[1]}/${redundancy[2]}.`;

  const coverage = message.match(/^PAPER symbol coverage is (\d+)\/(\d+) \(([^)]+)\)$/);
  if (coverage) return `La copertura simboli PAPER è ${coverage[1]}/${coverage[2]} (${coverage[3]}).`;

  return message;
}
