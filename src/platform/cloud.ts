import { create } from 'zustand';
import type { ArenaTemplate } from '@core/library/arenaTemplate';
import { newId } from '@core/model/ids';
import { firebaseConfig } from './firebaseConfig';
import {
  allCourseEntries,
  putCourseFromCloud,
  removeCourseFromCloud,
  type CourseEntry,
} from './courseLibrary';
import { onLocalChange, type LocalChange } from './localChanges';
import { planSync, type RemoteMeta } from './syncPlan';
import {
  initTemplateStore,
  localTemplates,
  putTemplateFromCloud,
  removeTemplateFromCloud,
} from './templateStore';
import { t } from '@core/i18n/i18n';

/**
 * Nuvem do Arena (B-36, B-78, decisão 90).
 *
 * Login com Google, OPCIONAL: sem ele tudo funciona no aparelho; com ele,
 * Minhas pistas e Meus percursos ganham cópia na nuvem e aparecem em
 * outros aparelhos. O Firebase só é baixado quando alguém entra (ou já
 * tinha entrado neste aparelho) — quem não usa a nuvem não paga o peso.
 *
 * No Firestore: usuarios/{uid} (perfil) → arquivos/{id} (metadados, data,
 * apagado) → partes/{n} (o conteúdo em fatias de até ~700 mil caracteres,
 * porque cada documento cabe 1 MB e uma imagem de fundo passa disso).
 * Quem lê o quê está nas regras do servidor (firestore.rules).
 */

export const ADMIN_EMAIL = 'pedrohbombardelli@gmail.com';
const FATIA = 700_000;
const LEMBRA_LOGIN = 'arena.nuvem.logado';
const SINCRONIZADO = 'arena.nuvem.sincronizado';
export const ACEITE = 'arena.nuvem.aceite-v1';

export interface CloudUser {
  uid: string;
  email: string;
  name: string;
  photo: string | null;
  admin: boolean;
}

interface CloudState {
  user: CloudUser | null;
  status: 'desligado' | 'conectando' | 'sincronizando' | 'em-dia' | 'erro';
  lastSync: string | null;
  error: string | null;
}

export const useCloudStore = create<CloudState>(() => ({ user: null, status: 'desligado', lastSync: null, error: null }));

/* ---------------------------------------------------------- firebase */

type Fb = Awaited<ReturnType<typeof carregar>>;
let fb: Promise<Fb> | null = null;

async function carregar() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);
  const app = initializeApp(firebaseConfig);
  return { auth, fs, a: auth.getAuth(app), db: fs.getFirestore(app) };
}

const firebase = (): Promise<Fb> => (fb ??= carregar());

/* --------------------------------------------------------- arquivos */

interface RemoteFile extends RemoteMeta {
  tipo: 'pista' | 'percurso';
  nome: string;
  partes: number;
  meta: Record<string, unknown>;
}

async function arquivos(f: Fb, uid: string): Promise<RemoteFile[]> {
  const snap = await f.fs.getDocs(f.fs.collection(f.db, 'usuarios', uid, 'arquivos'));
  return snap.docs.map((d) => d.data() as RemoteFile);
}

/** Lê o conteúdo de um arquivo de qualquer usuário (o admin lê os dos outros). */
export async function readRemoteContent(uid: string, arquivo: RemoteFile): Promise<string> {
  const f = await firebase();
  const pedacos = await Promise.all(
    Array.from({ length: arquivo.partes }, (_, i) =>
      f.fs.getDoc(f.fs.doc(f.db, 'usuarios', uid, 'arquivos', arquivo.id, 'partes', String(i))),
    ),
  );
  return pedacos.map((p) => (p.data()?.texto as string) ?? '').join('');
}

async function enviar(f: Fb, uid: string, base: Omit<RemoteFile, 'partes' | 'apagado'>, texto: string): Promise<void> {
  const fatias = Math.max(1, Math.ceil(texto.length / FATIA));
  const ref = f.fs.doc(f.db, 'usuarios', uid, 'arquivos', base.id);
  const anterior = await f.fs.getDoc(ref);
  const partesAntes = (anterior.data()?.partes as number | undefined) ?? 0;
  // As partes primeiro e o índice por último: quem lê no meio do caminho
  // ainda vê a versão anterior inteira.
  for (let i = 0; i < fatias; i += 1) {
    await f.fs.setDoc(f.fs.doc(ref, 'partes', String(i)), { texto: texto.slice(i * FATIA, (i + 1) * FATIA) });
  }
  await f.fs.setDoc(ref, { ...base, partes: fatias, apagado: false });
  for (let i = fatias; i < partesAntes; i += 1) await f.fs.deleteDoc(f.fs.doc(ref, 'partes', String(i)));
}

async function marcarApagado(f: Fb, uid: string, tipo: 'pista' | 'percurso', id: string): Promise<void> {
  const ref = f.fs.doc(f.db, 'usuarios', uid, 'arquivos', id);
  const anterior = await f.fs.getDoc(ref);
  const partes = (anterior.data()?.partes as number | undefined) ?? 0;
  for (let i = 0; i < partes; i += 1) await f.fs.deleteDoc(f.fs.doc(ref, 'partes', String(i)));
  // Fica a lápide: outro aparelho que ainda tenha o arquivo sabe que é para apagar.
  await f.fs.setDoc(ref, { id, tipo, nome: anterior.data()?.nome ?? '', savedAt: new Date().toISOString(), apagado: true, partes: 0, meta: {} });
}

/* ------------------------------------------------- versões locais */

const lerSincronizado = (): Record<string, string> => {
  try {
    return JSON.parse(window.localStorage.getItem(SINCRONIZADO) ?? '{}');
  } catch {
    return {};
  }
};
const gravarSincronizado = (m: Record<string, string>) => window.localStorage.setItem(SINCRONIZADO, JSON.stringify(m));

function metaPista(t: ArenaTemplate) {
  return { id: t.id, tipo: 'pista' as const, nome: t.name, savedAt: t.savedAt, meta: { widthM: t.summary?.widthM ?? 0, heightM: t.summary?.heightM ?? 0 } };
}
function metaPercurso(c: CourseEntry) {
  return {
    id: c.id,
    tipo: 'percurso' as const,
    nome: c.name,
    savedAt: c.savedAt,
    meta: { kind: c.kind ?? 'percurso', arenaName: c.arenaName, obstacleCount: c.obstacleCount },
  };
}

/* ----------------------------------------------------- sincronizar */

let sincronizando: Promise<void> | null = null;

/** Deixa este aparelho e a nuvem iguais. */
export function syncNow(): Promise<void> {
  sincronizando ??= (async () => {
    const user = useCloudStore.getState().user;
    if (!user) return;
    useCloudStore.setState({ status: 'sincronizando', error: null });
    try {
      const f = await firebase();
      await initTemplateStore();
      const remotos = await arquivos(f, user.uid);
      const pistas = localTemplates();
      const percursos = await allCourseEntries();
      const sinc = lerSincronizado();
      const locais = [...pistas.map((t) => ({ id: t.id, savedAt: t.savedAt })), ...percursos.map((c) => ({ id: c.id, savedAt: c.savedAt }))];
      const porId = new Map(remotos.map((r) => [r.id, r]));

      const baixar = async (r: RemoteFile) => {
        const texto = await readRemoteContent(user.uid, r);
        if (r.tipo === 'pista') await putTemplateFromCloud(JSON.parse(texto) as ArenaTemplate);
        else await putCourseFromCloud({ ...(r.meta as object), id: r.id, name: r.nome, savedAt: r.savedAt, text: texto } as CourseEntry);
        sinc[r.id] = r.savedAt;
      };
      const subir = async (id: string) => {
        const t = pistas.find((x) => x.id === id);
        if (t) await enviar(f, user.uid, metaPista(t), JSON.stringify(t));
        const c = percursos.find((x) => x.id === id);
        if (c) await enviar(f, user.uid, metaPercurso(c), c.text);
        sinc[id] = (t ?? c)!.savedAt;
      };
      // Os dois mudaram: guarda a versão perdedora como cópia, com outro id.
      const copiaLocal = async (id: string) => {
        const tpl = pistas.find((x) => x.id === id);
        if (tpl) await putTemplateFromCloud({ ...tpl, id: newId('tpl'), name: t('nuvem.copiaAparelho', { nome: tpl.name }) });
        const c = percursos.find((x) => x.id === id);
        if (c) await putCourseFromCloud({ ...c, id: newId('pcs'), name: t('nuvem.copiaAparelho', { nome: c.name }) });
      };

      for (const acao of planSync(locais, remotos, sinc)) {
        const r = porId.get(acao.id);
        if (acao.faz === 'baixar' && r) await baixar(r);
        else if (acao.faz === 'enviar') await subir(acao.id);
        else if (acao.faz === 'apagar-local' && r) {
          if (r.tipo === 'pista') await removeTemplateFromCloud(r.id);
          else await removeCourseFromCloud(r.id);
          sinc[r.id] = r.savedAt;
        } else if (acao.faz === 'copiar-local-e-baixar' && r) {
          await copiaLocal(acao.id);
          await baixar(r);
        } else if (acao.faz === 'copiar-remota-e-enviar' && r) {
          const texto = await readRemoteContent(user.uid, r);
          if (r.tipo === 'pista') await putTemplateFromCloud({ ...(JSON.parse(texto) as ArenaTemplate), id: newId('tpl'), name: t('nuvem.copiaNuvem', { nome: r.nome }) });
          else await putCourseFromCloud({ ...(r.meta as object), id: newId('pcs'), name: t('nuvem.copiaNuvem', { nome: r.nome }), savedAt: r.savedAt, text: texto } as CourseEntry);
          await subir(acao.id);
        }
      }
      gravarSincronizado(sinc);
      useCloudStore.setState({ status: 'em-dia', lastSync: new Date().toISOString() });
    } catch (err) {
      console.warn('Sincronização falhou:', err);
      useCloudStore.setState({ status: 'erro', error: err instanceof Error ? err.message : String(err) });
    }
  })().finally(() => {
    sincronizando = null;
  });
  return sincronizando;
}

/** Mudou algo aqui: manda para a nuvem (ou marca apagado lá). */
async function aoMudar(m: LocalChange): Promise<void> {
  const user = useCloudStore.getState().user;
  if (!user) return;
  try {
    const f = await firebase();
    const sinc = lerSincronizado();
    if (m.apagado) {
      await marcarApagado(f, user.uid, m.tipo, m.id);
      delete sinc[m.id];
    } else if (m.tipo === 'pista') {
      await initTemplateStore();
      const t = localTemplates().find((x) => x.id === m.id);
      if (t) {
        await enviar(f, user.uid, metaPista(t), JSON.stringify(t));
        sinc[t.id] = t.savedAt;
      }
    } else {
      const c = (await allCourseEntries()).find((x) => x.id === m.id);
      if (c) {
        await enviar(f, user.uid, metaPercurso(c), c.text);
        sinc[c.id] = c.savedAt;
      }
    }
    gravarSincronizado(sinc);
    useCloudStore.setState({ status: 'em-dia', lastSync: new Date().toISOString(), error: null });
  } catch (err) {
    // Sem rede: fica para a próxima sincronização, que acerta tudo.
    console.warn('Envio para a nuvem falhou; vai na próxima sincronização.', err);
    useCloudStore.setState({ status: 'erro', error: t('nuvem.semConexao') });
  }
}

/* ----------------------------------------------------------- conta */

function aoEntrar(f: Fb, u: import('firebase/auth').User): void {
  const user: CloudUser = {
    uid: u.uid,
    email: u.email ?? '',
    name: u.displayName ?? u.email ?? t('nuvem.usuario'),
    photo: u.photoURL,
    admin: u.email === ADMIN_EMAIL && u.emailVerified,
  };
  useCloudStore.setState({ user, status: 'em-dia' });
  window.localStorage.setItem(LEMBRA_LOGIN, '1');
  // O perfil é o que o painel de admin lista.
  void f.fs
    .setDoc(f.fs.doc(f.db, 'usuarios', u.uid), { email: user.email, nome: user.name, ultimoAcesso: f.fs.serverTimestamp() }, { merge: true })
    .catch(() => undefined);
  void syncNow();
}

let observando = false;
async function observar(): Promise<Fb> {
  const f = await firebase();
  if (!observando) {
    observando = true;
    f.auth.onAuthStateChanged(f.a, (u) => {
      if (u) aoEntrar(f, u);
      else useCloudStore.setState({ user: null, status: 'desligado' });
    });
  }
  return f;
}

/** Entrar com Google (o aceite da política já foi dado na interface). */
export async function signIn(): Promise<void> {
  useCloudStore.setState({ status: 'conectando', error: null });
  try {
    const f = await observar();
    await f.auth.signInWithPopup(f.a, new f.auth.GoogleAuthProvider());
  } catch (err) {
    const codigo = (err as { code?: string }).code ?? '';
    const cancelado = codigo === 'auth/popup-closed-by-user' || codigo === 'auth/cancelled-popup-request';
    useCloudStore.setState({
      status: 'desligado',
      error: cancelado ? null : t('nuvem.naoEntrou'),
    });
  }
}

export async function signOut(): Promise<void> {
  window.localStorage.removeItem(LEMBRA_LOGIN);
  const f = await firebase();
  await f.auth.signOut(f.a);
  useCloudStore.setState({ user: null, status: 'desligado', lastSync: null });
}

/** Na abertura: quem já tinha entrado neste aparelho volta conectado. */
export function setupCloud(): void {
  onLocalChange((m) => void aoMudar(m));
  if (window.localStorage.getItem(LEMBRA_LOGIN)) void observar().catch(() => undefined);
  // Voltou a conexão: acerta o que ficou pendente.
  window.addEventListener('online', () => void syncNow());
}

/* ------------------------------------------------------------ admin */

export interface AdminUser {
  uid: string;
  email: string;
  nome: string;
  ultimoAcesso: Date | null;
}

export async function listUsers(): Promise<AdminUser[]> {
  const f = await firebase();
  const snap = await f.fs.getDocs(f.fs.collection(f.db, 'usuarios'));
  return snap.docs
    .map((d) => {
      const v = d.data();
      const ts = v.ultimoAcesso as { toDate?: () => Date } | undefined;
      return { uid: d.id, email: (v.email as string) ?? '', nome: (v.nome as string) ?? '', ultimoAcesso: ts?.toDate?.() ?? null };
    })
    .sort((a, b) => (b.ultimoAcesso?.getTime() ?? 0) - (a.ultimoAcesso?.getTime() ?? 0));
}

export async function listUserFiles(uid: string): Promise<RemoteFile[]> {
  const f = await firebase();
  return (await arquivos(f, uid)).filter((a) => !a.apagado).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export type { RemoteFile };
