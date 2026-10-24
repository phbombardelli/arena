import { useEffect, useState } from 'react';
import { IconCloud, IconCloudCheck, IconCloudOff, IconRefresh } from '@tabler/icons-react';
import { deserialize } from '@core/persistence/serialize';
import type { ArenaTemplate } from '@core/library/arenaTemplate';
import {
  ACEITE,
  listUserFiles,
  listUsers,
  readRemoteContent,
  signIn,
  signOut,
  syncNow,
  useCloudStore,
  type AdminUser,
  type RemoteFile,
} from '@platform/cloud';
import { exportTemplateFile } from '@platform/templateStore';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { Popover } from '@ui/common/Popover';
import { newCourse } from '@ui/actions/documentActions';

/**
 * Conta e nuvem na barra de cima (B-36, B-78, B-79). Login opcional: o
 * botão "Entrar" pede o aceite na primeira vez; entrando, o ícone mostra o
 * estado do backup e o menu traz sincronizar, sair e — para o admin — o
 * painel com os arquivos dos usuários.
 */

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

export function AccountButton() {
  const { user, status, lastSync, error } = useCloudStore();
  const setDialog = useEditorStore((s) => s.setDialog);

  if (!user) {
    return (
      <button
        className="cloud-signin"
        disabled={status === 'conectando'}
        title="Entrar com a conta Google para ter backup na nuvem (opcional)"
        onClick={() => {
          if (window.localStorage.getItem(ACEITE)) void signIn();
          else setDialog('nuvem');
        }}
      >
        <IconCloud size={17} stroke={1.7} />
        <span className="cloud-signin-text">{status === 'conectando' ? 'Entrando…' : 'Entrar'}</span>
      </button>
    );
  }

  const Icone = status === 'erro' ? IconCloudOff : status === 'sincronizando' ? IconRefresh : IconCloudCheck;
  return (
    <Popover
      align="right"
      className="account-popover"
      title={status === 'erro' ? 'Backup com problema' : 'Backup na nuvem'}
      trigger={
        <span className={`account-trigger ${status}`}>
          {user.photo ? <img src={user.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{user.name.slice(0, 1)}</span>}
          <Icone size={15} stroke={1.8} />
        </span>
      }
    >
      {(fecha) => (
        <div className="account-menu">
          <p className="account-name">
            <strong>{user.name}</strong>
            <em>{user.email}</em>
          </p>
          <p className="note">
            {status === 'sincronizando'
              ? 'Sincronizando…'
              : status === 'erro'
                ? (error ?? 'Não foi possível falar com a nuvem.')
                : `Backup em dia${lastSync ? ` · ${hora(lastSync)}` : ''}`}
          </p>
          <button onClick={() => void syncNow()} disabled={status === 'sincronizando'}>
            Sincronizar agora
          </button>
          {user.admin && (
            <button
              onClick={() => {
                fecha();
                setDialog('admin');
              }}
            >
              Painel de admin
            </button>
          )}
          <button
            onClick={() => {
              fecha();
              void signOut();
            }}
          >
            Sair
          </button>
          <p className="note dim">Saindo, seus arquivos continuam neste aparelho.</p>
        </div>
      )}
    </Popover>
  );
}

/** Aceite antes do primeiro login: o que acontece com os arquivos. */
export function CloudConsentBody() {
  const fecha = () => useEditorStore.getState().setDialog(null);
  return (
    <section className="file-dialog">
      <p>
        Entrando com a sua conta Google, <strong>Minhas pistas</strong> e <strong>Meus percursos</strong> ganham uma
        cópia na nuvem do Arena e aparecem nos outros aparelhos em que você entrar.
      </p>
      <p>Sem entrar, tudo continua funcionando neste aparelho, como sempre.</p>
      <p className="note">
        Saiba que o administrador do Arena pode acessar os arquivos guardados na nuvem, para suporte e para melhorar o
        programa. Seus arquivos não são vendidos nem divulgados. Você pode sair quando quiser.
      </p>
      <div className="row-buttons">
        <button onClick={fecha}>Agora não</button>
        <button
          className="primary"
          onClick={() => {
            window.localStorage.setItem(ACEITE, new Date().toISOString());
            fecha();
            void signIn();
          }}
        >
          Concordo e entrar com Google
        </button>
      </div>
    </section>
  );
}

/** Painel de admin (B-79): usuários e os arquivos de cada um. */
export function AdminPanelBody() {
  const [usuarios, setUsuarios] = useState<AdminUser[] | null>(null);
  const [aberto, setAberto] = useState<AdminUser | null>(null);
  const [arquivos, setArquivos] = useState<RemoteFile[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listUsers().then(setUsuarios, (e) => setErro(String(e)));
  }, []);
  useEffect(() => {
    if (!aberto) return;
    setArquivos(null);
    listUserFiles(aberto.uid).then(setArquivos, (e) => setErro(String(e)));
  }, [aberto]);

  const baixar = async (u: AdminUser, a: RemoteFile) => {
    const texto = await readRemoteContent(u.uid, a);
    if (a.tipo === 'pista') {
      exportTemplateFile(JSON.parse(texto) as ArenaTemplate);
      return;
    }
    const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.nome}.pcs`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const abrir = async (u: AdminUser, a: RemoteFile) => {
    const texto = await readRemoteContent(u.uid, a);
    if (a.tipo === 'pista') {
      if (newCourse(JSON.parse(texto) as ArenaTemplate, 'percurso') !== 'ok') return;
    } else {
      const st = useDocumentStore.getState();
      if (st.dirty && !window.confirm('O croqui aberto tem alterações não salvas. Abrir mesmo assim?')) return;
      const { document } = deserialize(texto);
      st.replace(document, { name: `${a.nome} — ${u.email}`, handle: null, libraryId: null });
    }
    useEditorStore.getState().setDialog(null);
  };

  if (erro) return <p className="note">Não foi possível ler a nuvem: {erro}</p>;
  if (!usuarios) return <p className="note">Carregando…</p>;

  return (
    <section className="file-dialog">
      {!aberto ? (
        <>
          <h3>Usuários ({usuarios.length})</h3>
          <ul className="file-list">
            {usuarios.map((u) => (
              <li key={u.uid}>
                <div className="file-name">
                  <strong>{u.nome || u.email}</strong>
                  <em>
                    {u.email}
                    {u.ultimoAcesso ? ` · último acesso ${u.ultimoAcesso.toLocaleDateString('pt-BR')}` : ''}
                  </em>
                </div>
                <button className="primary" onClick={() => setAberto(u)}>
                  Arquivos
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="row-buttons">
            <button onClick={() => setAberto(null)}>← Usuários</button>
          </div>
          <h3>{aberto.nome || aberto.email}</h3>
          {!arquivos ? (
            <p className="note">Carregando…</p>
          ) : arquivos.length === 0 ? (
            <p className="note">Nenhum arquivo na nuvem.</p>
          ) : (
            <ul className="file-list">
              {arquivos.map((a) => (
                <li key={a.id}>
                  <div className="file-name">
                    <strong>
                      {a.nome}
                      <span className="file-tag">
                        {a.tipo === 'pista' ? 'Pista' : (a.meta.kind as string) === 'ginastica' ? 'Ginástica' : 'Percurso'}
                      </span>
                    </strong>
                    <em>{new Date(a.savedAt).toLocaleString('pt-BR')}</em>
                  </div>
                  <button className="primary" onClick={() => void abrir(aberto, a)} title="Abre aqui para ver (salvar guarda uma cópia sua)">
                    Abrir
                  </button>
                  <button className="mini" title="Baixar o arquivo" onClick={() => void baixar(aberto, a)}>
                    ↓
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="note dim">
            Para pôr uma pista no banco do programa: baixe o .pista e coloque em public/pistas (com o nome no index.json).
          </p>
        </>
      )}
    </section>
  );
}
