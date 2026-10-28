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
import { formatDate, formatDateTime, formatTime, t } from '@core/i18n/i18n';

/**
 * Conta e nuvem na barra de cima (B-36, B-78, B-79). Login opcional: o
 * botão "Entrar" pede o aceite na primeira vez; entrando, o ícone mostra o
 * estado do backup e o menu traz sincronizar, sair e — para o admin — o
 * painel com os arquivos dos usuários.
 */

const hora = (iso: string | null) => (iso ? formatTime(new Date(iso)) : '');

export function AccountButton() {
  const { user, status, lastSync, error } = useCloudStore();
  const setDialog = useEditorStore((s) => s.setDialog);

  if (!user) {
    return (
      <button
        className="cloud-signin"
        disabled={status === 'conectando'}
        title={t('nuvem.entrarDica')}
        onClick={() => {
          if (window.localStorage.getItem(ACEITE)) void signIn();
          else setDialog('nuvem');
        }}
      >
        <IconCloud size={17} stroke={1.7} />
        <span className="cloud-signin-text">{t(status === 'conectando' ? 'nuvem.entrando' : 'nuvem.entrar')}</span>
      </button>
    );
  }

  const Icone = status === 'erro' ? IconCloudOff : status === 'sincronizando' ? IconRefresh : IconCloudCheck;
  return (
    <Popover
      align="right"
      className="account-popover"
      title={t(status === 'erro' ? 'nuvem.backupProblema' : 'nuvem.backup')}
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
              ? t('nuvem.sincronizando')
              : status === 'erro'
                ? (error ?? t('nuvem.semResposta'))
                : `${t('nuvem.emDia')}${lastSync ? ` · ${hora(lastSync)}` : ''}`}
          </p>
          <button onClick={() => void syncNow()} disabled={status === 'sincronizando'}>
            {t('nuvem.sincronizar')}
          </button>
          {user.admin && (
            <button
              onClick={() => {
                fecha();
                setDialog('admin');
              }}
            >
              {t('nuvem.painelAdmin')}
            </button>
          )}
          <button
            onClick={() => {
              fecha();
              void signOut();
            }}
          >
            {t('nuvem.sair')}
          </button>
          <p className="note dim">{t('nuvem.saindo')}</p>
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
        {t('nuvem.aceite1')} <strong>{t('nuvem.minhasPistas')}</strong> {t('nuvem.e')} <strong>{t('arq.meusPercursos')}</strong>{' '}
        {t('nuvem.aceite2')}
      </p>
      <p>{t('nuvem.semEntrar')}</p>
      <p className="note">
        {t('nuvem.admin')}
      </p>
      <div className="row-buttons">
        <button onClick={fecha}>{t('nuvem.agoraNao')}</button>
        <button
          className="primary"
          onClick={() => {
            window.localStorage.setItem(ACEITE, new Date().toISOString());
            fecha();
            void signIn();
          }}
        >
          {t('nuvem.concordo')}
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
      if (st.dirty && !window.confirm(t('nuvem.abrirMesmoAssim'))) return;
      const { document } = deserialize(texto);
      st.replace(document, { name: `${a.nome} — ${u.email}`, handle: null, libraryId: null });
    }
    useEditorStore.getState().setDialog(null);
  };

  if (erro) return <p className="note">{t('nuvem.naoLeu', { erro })}</p>;
  if (!usuarios) return <p className="note">{t('arq.carregando')}</p>;

  return (
    <section className="file-dialog">
      {!aberto ? (
        <>
          <h3>{t('nuvem.usuarios', { n: usuarios.length })}</h3>
          <ul className="file-list">
            {usuarios.map((u) => (
              <li key={u.uid}>
                <div className="file-name">
                  <strong>{u.nome || u.email}</strong>
                  <em>
                    {u.email}
                    {u.ultimoAcesso ? ` · ${t('nuvem.ultimoAcesso', { data: formatDate(u.ultimoAcesso) })}` : ''}
                  </em>
                </div>
                <button className="primary" onClick={() => setAberto(u)}>
                  {t('nuvem.arquivos')}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="row-buttons">
            <button onClick={() => setAberto(null)}>← {t('nuvem.usuariosVoltar')}</button>
          </div>
          <h3>{aberto.nome || aberto.email}</h3>
          {!arquivos ? (
            <p className="note">{t('arq.carregando')}</p>
          ) : arquivos.length === 0 ? (
            <p className="note">{t('nuvem.nenhumArquivo')}</p>
          ) : (
            <ul className="file-list">
              {arquivos.map((a) => (
                <li key={a.id}>
                  <div className="file-name">
                    <strong>
                      {a.nome}
                      <span className="file-tag">
                        {t(a.tipo === 'pista' ? 'aviso.pista' : (a.meta.kind as string) === 'ginastica' ? 'arq.tagGin' : 'nuvem.percurso')}
                      </span>
                    </strong>
                    <em>{formatDateTime(new Date(a.savedAt))}</em>
                  </div>
                  <button className="primary" onClick={() => void abrir(aberto, a)} title={t('nuvem.abreAqui')}>
                    {t('arq.abrir')}
                  </button>
                  <button className="mini" title={t('nuvem.baixar')} onClick={() => void baixar(aberto, a)}>
                    ↓
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="note dim">
            {t('nuvem.bancoPrograma')}
          </p>
        </>
      )}
    </section>
  );
}
