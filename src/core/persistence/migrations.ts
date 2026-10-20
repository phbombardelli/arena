import { CourseFileError } from './format';

/**
 * Migrações de esquema. Cada entrada leva um documento da versão `n` para
 * a `n+1`, sempre sobre JSON cru — nunca sobre os tipos atuais do modelo,
 * que vão continuar mudando e deixariam a migração antiga sem compilar.
 *
 * Regra: uma vez publicada uma versão, sua migração nunca mais muda.
 */
export type RawDocument = Record<string, unknown>;
export type Migration = (doc: RawDocument) => RawDocument;

/**
 * 1 → 2. O liverpool deixou de ser um tipo de obstáculo e virou uma opção
 * de vertical e oxer; as varas ganharam estilo e cor; os rótulos ganharam
 * posicionamento automático.
 *
 * Um liverpool antigo vira um oxer com a lâmina de água ligada — é o que
 * ele desenhava, e o desenho do usuário não pode mudar ao abrir.
 */
const v1ToV2: Migration = (doc) => {
  const objects = Array.isArray(doc.objects) ? doc.objects : [];
  return {
    ...doc,
    objects: objects.map((raw) => {
      const obj = raw as Record<string, unknown>;
      if (obj.kind !== 'obstacle') return obj;

      const eraLiverpool = obj.type === 'liverpool';
      const spread = typeof obj.spreadM === 'number' ? obj.spreadM : 2;

      return {
        ...obj,
        type: eraLiverpool ? 'oxer' : obj.type,
        bar: obj.bar ?? { style: 'pontas', color: '#ffffff', accent: '#c62828', stripes: 6 },
        liverpool: obj.liverpool ?? {
          enabled: eraLiverpool,
          spreadM: eraLiverpool ? spread : 2,
          offsetM: 0,
          overhangM: 0.25,
          color: '#2b7fd4',
        },
        numberLabel: withAuto(obj.numberLabel),
        heightLabel: withAuto(obj.heightLabel),
      };
    }),
  };
};

/**
 * Rótulo gravado antes do automático: mantém a posição que o usuário via,
 * em vez de reposicionar o croqui dele na abertura.
 */
function withAuto(raw: unknown): Record<string, unknown> {
  const label = (raw ?? {}) as Record<string, unknown>;
  return {
    visible: label.visible ?? true,
    auto: false,
    offsetM: label.offsetM ?? { x: 0, y: 0 },
  };
}

/**
 * 2 → 3. Os obstáculos ganharam paraflanco, e a lâmina de água passou a
 * ter comprimento próprio em vez de "sobra nos lados".
 *
 * O que estava desenhado continua igual: `overhangM` vira o comprimento
 * equivalente (frente + duas sobras), e quem já tinha obstáculo desenhado
 * recebe o suporte de montante — não o paraflanco —, para o croqui antigo
 * não mudar de aparência sozinho.
 */
const v2ToV3: Migration = (doc) => {
  const objects = Array.isArray(doc.objects) ? doc.objects : [];
  return {
    ...doc,
    objects: objects.map((raw) => {
      const obj = raw as Record<string, unknown>;
      if (obj.kind !== 'obstacle') return obj;

      const liverpool = (obj.liverpool ?? {}) as Record<string, unknown>;
      const face = typeof obj.faceWidthM === 'number' ? obj.faceWidthM : 3.5;
      const sobra = typeof liverpool.overhangM === 'number' ? liverpool.overhangM : 0;
      const { overhangM: _descartado, ...restoLiverpool } = liverpool;

      return {
        ...obj,
        wings: obj.wings ?? { style: 'pilar', widthM: 0.4, depthM: 0.9, color: '#2e7d32' },
        liverpool: {
          ...restoLiverpool,
          enabled: liverpool.enabled ?? false,
          widthM: liverpool.widthM ?? face + sobra * 2,
          spreadM: liverpool.spreadM ?? 0.5,
          offsetM: liverpool.offsetM ?? 0,
          color: liverpool.color ?? '#2b7fd4',
        },
      };
    }),
  };
};

/**
 * 3 → 4. O traçado passou a mostrar UMA distância por linha, em vez de uma
 * por trecho.
 *
 * Traçado antigo mantém o modo por trecho: era o que estava desenhado, e
 * abrir o arquivo não pode mudar o croqui de quem já o tinha pronto.
 */
const v3ToV4: Migration = (doc) => {
  const objects = Array.isArray(doc.objects) ? doc.objects : [];
  return {
    ...doc,
    objects: objects.map((raw) => {
      const obj = raw as Record<string, unknown>;
      if (obj.kind !== 'path') return obj;
      return {
        ...obj,
        distanceMode: obj.distanceMode ?? 'trecho',
        totalLabel: obj.totalLabel ?? {
          visible: true,
          offsetM: { x: 0, y: -1.5 },
          decimals: 2,
          color: '#d32020',
        },
      };
    }),
  };
};

/**
 * 4 → 5. Objetos passaram a declarar a que parte pertencem: cenário da
 * pista ou percurso. Arquivo antigo recebe o escopo padrão do tipo, que é
 * exatamente como ele já se comportava.
 */
const v4ToV5: Migration = (doc) => {
  const objects = Array.isArray(doc.objects) ? doc.objects : [];
  const daPista = ['arena', 'image', 'ornament'];
  return {
    ...doc,
    objects: objects.map((raw) => {
      const obj = raw as Record<string, unknown>;
      return {
        ...obj,
        scope: obj.scope ?? (daPista.includes(String(obj.kind)) ? 'pista' : 'percurso'),
      };
    }),
  };
};

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: v1ToV2,
  2: v2ToV3,
  3: v3ToV4,
  4: v4ToV5,
  5: v5ToV6,
  6: v6ToV7,
  7: v7ToV8,
  8: v8ToV9,
};

/**
 * 8 -> 9: o ímã saiu do editor (B-38). Os campos do ímã somem do arquivo;
 * o passo do giro com Shift continua.
 */
function v8ToV9(doc: RawDocument): RawDocument {
  const grid = doc.grid as Record<string, unknown> | undefined;
  if (grid) {
    delete grid.snap;
    delete grid.snapStepM;
  }
  return doc;
}

/**
 * 7 -> 8: bandeirolas e distâncias escolhidas no traçado.
 *
 * Croqui antigo sai sem bandeirola e sem distância entre obstáculos no
 * desenho — exatamente como era impresso até aqui. Ligar qualquer das
 * duas sozinho mudaria a folha de quem só abriu o arquivo.
 */
function v7ToV8(doc: RawDocument): RawDocument {
  if (doc.flags === undefined) doc.flags = false;
  for (const obj of (doc.objects as Record<string, unknown>[]) ?? []) {
    if (obj.kind === 'path' && obj.obstacleDistances === undefined) obj.obstacleDistances = {};
  }
  return doc;
}

/**
 * 5 -> 6: legenda de escala na página.
 *
 * Croqui antigo passa a declarar a escala, ligada e no canto inferior
 * direito, que é onde os planos oficiais a imprimem. Ligar por padrão é
 * a escolha certa: a legenda só ajuda, e um croqui sem escala declarada
 * é um croqui que não se confere com régua.
 */
function v5ToV6(doc: RawDocument): RawDocument {
  const page = doc.page as Record<string, unknown> | undefined;
  if (page && page.scaleLabel == null) {
    page.scaleLabel = { visible: true, corner: 'inferior-direito', bar: true };
  }
  return doc;
}

/**
 * 6 -> 7: a cruzada de tempo passa a poder seguir o obstáculo.
 *
 * Croqui antigo tem cruzada solta, e solta ela continua: `anchor` nulo
 * quer dizer "ninguém a segue". Vincular sozinho seria adivinhar a qual
 * obstáculo ela pertence, e adivinhar moveria o desenho de alguém.
 */
function v6ToV7(doc: RawDocument): RawDocument {
  for (const obj of (doc.objects as Record<string, unknown>[]) ?? []) {
    if (obj.kind === 'timing' && obj.anchor === undefined) obj.anchor = null;
  }
  return doc;
}

export function applyMigrations(
  doc: RawDocument,
  fromVersion: number,
  toVersion: number,
  table: Readonly<Record<number, Migration>> = MIGRATIONS,
): RawDocument {
  if (fromVersion > toVersion) {
    throw new CourseFileError(
      'Este arquivo foi salvo por uma versão mais nova do Percurso.',
      `Versão do arquivo: ${fromVersion}. Versão suportada: ${toVersion}.`,
    );
  }

  let current = doc;
  for (let v = fromVersion; v < toVersion; v += 1) {
    const migrate = table[v];
    if (!migrate) {
      throw new CourseFileError(
        'Não foi possível atualizar este arquivo.',
        `Falta a migração da versão ${v} para a ${v + 1}.`,
      );
    }
    current = migrate(current);
  }
  return current;
}
