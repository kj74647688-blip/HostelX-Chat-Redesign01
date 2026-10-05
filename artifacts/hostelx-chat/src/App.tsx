import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useGetSession, getGetSessionQueryKey, useLogin, useLogout,
  useCompleteFirstLoginSetup, useUpdateProfile, useResetUserPassword, useSetUserRole,
  useListAdminUsers, getListAdminUsersQueryKey, useListChats, getListChatsQueryKey,
  useCreateChat, useUpdateChat, useDeleteChat, useAddChatMembers, useRemoveChatMember,
  useListChatMessages, getListChatMessagesQueryKey, useSendChatMessage,
  useRequestUploadUrl, useCompleteUpload,
} from '@workspace/api-client-react';
import type { Chat, ChatMember, ChatMessage, CurrentSession, User, UploadUrlInputContentType } from '@workspace/api-client-react';
import {
  MessageCircle, Users, Search, Plus, Send, ArrowLeft, X, ShieldCheck, LogOut,
  Check, Settings2, UserRound, LockKeyhole, ChevronRight, Archive, Trash2,
  UserPlus, UserMinus, ImagePlus, RefreshCw, AlertCircle, LoaderCircle,
  MoreHorizontal, KeyRound,
} from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 4_000 },
  },
});

type Person = User | ChatMember;
type ModalState = 'profile' | 'create-chat' | 'manage-chat' | null;

function getDisplayName(person: Person | null | undefined) {
  return person?.displayName?.trim() || person?.loginId || 'Resident';
}

function getInitials(person: Person | null | undefined) {
  const name = getDisplayName(person);
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function imageUrl(path: string | null | undefined) {
  if (!path) return '';
  const objectId = path.split('/').filter(Boolean).pop();
  return objectId ? `/api/storage/objects/${encodeURIComponent(objectId)}` : '';
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function Avatar({ person, size = 'normal' }: { person?: Person | null; size?: 'normal' | 'small' | 'tiny' }) {
  const photo = imageUrl(person?.profilePhotoPath);
  const name = getDisplayName(person);
  return <div className={`avatar ${size === 'small' ? 'small' : size === 'tiny' ? 'tiny' : ''}`} data-testid={person ? `avatar-${person.internalId}` : 'avatar-placeholder'} aria-label={name}>
    {photo ? <img src={photo} alt="" /> : <span>{getInitials(person)}</span>}
  </div>;
}

function Logo() {
  return <div className="brand"><div className="brand-mark"><MessageCircle size={19} strokeWidth={2.5} /></div><div className="brand-word">Hostel<span>X</span></div></div>;
}

function LoadingScreen() {
  return <main className="login-screen"><div className="login-card loading-card" aria-label="Loading HostelX"><Logo /><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-line short" /><div className="skeleton-block" /></div></main>;
}

function AppContent() {
  const client = useQueryClient();
  const sessionQuery = useGetSession({
    query: { queryKey: getGetSessionQueryKey(), retry: false, refetchOnWindowFocus: true },
  });
  const session = sessionQuery.data as CurrentSession | undefined;
  const user = session?.user ?? null;
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const isOwner = user?.role === 'owner';

  const login = useLogin();
  const logout = useLogout();
  const completeSetup = useCompleteFirstLoginSetup();
  const updateProfile = useUpdateProfile();
  const resetPassword = useResetUserPassword();
  const setUserRole = useSetUserRole();
  const adminUsersQuery = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey(), enabled: Boolean(isOwner), retry: false, staleTime: 10_000 },
  });
  const chatsQuery = useListChats({
    query: { queryKey: getListChatsQueryKey(), enabled: Boolean(user && !user.firstLogin), refetchInterval: 12_000 },
  });
  const [selectedChatId, setSelectedChatId] = useState('');
  const [screen, setScreen] = useState<'chats' | 'management'>('chats');
  const [mobileConversation, setMobileConversation] = useState(false);
  const chatList = chatsQuery.data ?? [];
  const accessibleChats = isAdmin ? chatList : chatList.filter((chat) => !chat.archived);

  useEffect(() => {
    if (!accessibleChats.length) {
      if (selectedChatId) setSelectedChatId('');
      return;
    }
    if (!accessibleChats.some((chat) => chat.id === selectedChatId)) {
      setSelectedChatId(accessibleChats[0].id);
      if (window.matchMedia('(max-width: 720px)').matches) setMobileConversation(true);
    }
  }, [accessibleChats, selectedChatId]);

  const activeChat = accessibleChats.find((chat) => chat.id === selectedChatId);
  const messagesQuery = useListChatMessages(selectedChatId, {
    query: {
      queryKey: getListChatMessagesQueryKey(selectedChatId),
      enabled: Boolean(user && selectedChatId && !user.firstLogin),
      refetchInterval: 7_000,
    },
  });
  const sendMessage = useSendChatMessage();
  const createChat = useCreateChat();
  const updateChat = useUpdateChat();
  const deleteChat = useDeleteChat();
  const addChatMembers = useAddChatMembers();
  const removeChatMember = useRemoveChatMember();
  const requestUploadUrl = useRequestUploadUrl();
  const completeUpload = useCompleteUpload();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [chatName, setChatName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [addMemberId, setAddMemberId] = useState('');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [busyUpload, setBusyUpload] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const profileInputId = 'profile-photo-file';
  const chatInputId = 'chat-photo-file';

  const allPeople = useMemo(() => {
    const result = new Map<string, Person>();
    (adminUsersQuery.data ?? []).forEach((person) => result.set(person.internalId, person));
    chatList.forEach((chat) => chat.members.forEach((person) => result.set(person.internalId, person)));
    if (user) result.set(user.internalId, user);
    return Array.from(result.values()).sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
  }, [adminUsersQuery.data, chatList, user]);
  const filteredChats = accessibleChats.filter((chat) => chat.name.toLowerCase().includes(search.toLowerCase()));
  const messages = (messagesQuery.data ?? []).slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const availableToAdd = allPeople.filter((person) => !activeChat?.members.some((member) => member.internalId === person.internalId));
  useEffect(() => {
    const node = messageAreaRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messagesQuery.data?.length, selectedChatId]);

  async function uploadPhoto(file: File, purpose: 'profile' | 'chat') {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP, or GIF image.');
    if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('Images must be no larger than 5 MB.');
    setBusyUpload(true);
    try {
      const signed = await requestUploadUrl.mutateAsync({
        data: {
          name: file.name.slice(0, 180),
          size: file.size,
          contentType: file.type as UploadUrlInputContentType,
          purpose,
        },
      });
      const uploadResponse = await fetch(signed.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(`Image upload failed (${uploadResponse.status}).`);
      const completed = await completeUpload.mutateAsync({ data: { objectPath: signed.objectPath } });
      return completed.objectPath;
    } finally {
      setBusyUpload(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure('');
    setLoginSubmitting(true);
    try {
      const result = await login.mutateAsync({ data: { loginId: loginId.trim(), password } });
      client.setQueryData(getGetSessionQueryKey(), result);
      setPassword('');
      if (result.user?.firstLogin) {
        setDisplayName(result.user.displayName ?? '');
        setAbout(result.user.about ?? '');
      }
      await client.invalidateQueries({ queryKey: getListChatsQueryKey() });
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure('');
    if (newPassword.length < 8) {
      setFailure('Your new password needs at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFailure('Those passwords do not match.');
      return;
    }
    try {
      let profilePhotoPath: string | null | undefined;
      if (profileFile) profilePhotoPath = await uploadPhoto(profileFile, 'profile');
      const result = await completeSetup.mutateAsync({
        data: { displayName: displayName.trim(), newPassword, about: about.trim() || null, profilePhotoPath },
      });
      client.setQueryData(getGetSessionQueryKey(), result);
      setNewPassword('');
      setConfirmPassword('');
      setProfileFile(null);
      await client.invalidateQueries({ queryKey: getListChatsQueryKey() });
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeChat) return;
    setFailure('');
    try {
      const sent = await sendMessage.mutateAsync({ chatId: activeChat.id, data: { text } });
      client.setQueryData<ChatMessage[]>(getListChatMessagesQueryKey(activeChat.id), (old = []) => [...old, sent]);
      setDraft('');
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  function openCreateChat() {
    setChatName('');
    setChatFile(null);
    setMemberIds(user ? [user.internalId] : []);
    setModal('create-chat');
    setFailure('');
  }

  function openManageChat() {
    if (!activeChat) return;
    setChatName(activeChat.name);
    setChatFile(null);
    setAddMemberId('');
    setModal('manage-chat');
    setFailure('');
  }

  async function handleCreateChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatName.trim() || memberIds.length === 0) {
      setFailure('Give the chat a name and choose at least one member.');
      return;
    }
    setFailure('');
    try {
      let photoPath: string | null | undefined;
      if (chatFile) photoPath = await uploadPhoto(chatFile, 'chat');
      const created = await createChat.mutateAsync({
        data: { name: chatName.trim(), memberIds, photoPath },
      });
      await client.invalidateQueries({ queryKey: getListChatsQueryKey() });
      setSelectedChatId(created.id);
      setScreen('chats');
      setMobileConversation(true);
      setModal(null);
      setNotice(`“${created.name}” is ready.`);
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function handleRenameChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeChat || !chatName.trim()) return;
    setFailure('');
    try {
      let photoPath: string | null | undefined;
      if (chatFile) photoPath = await uploadPhoto(chatFile, 'chat');
      const updated = await updateChat.mutateAsync({
        chatId: activeChat.id,
        data: { name: chatName.trim(), ...(photoPath ? { photoPath } : {}) },
      });
      client.setQueryData<Chat[]>(getListChatsQueryKey(), (old) => old?.map((chat) => chat.id === updated.id ? updated : chat));
      await client.invalidateQueries({ queryKey: getListChatsQueryKey() });
      setNotice('Chat details updated.');
      setModal(null);
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function toggleArchive() {
    if (!activeChat) return;
    setFailure('');
    try {
      await updateChat.mutateAsync({ chatId: activeChat.id, data: { archived: !activeChat.archived } });
      await client.invalidateQueries({ queryKey: getListChatsQueryKey() });
      setNotice(activeChat.archived ? 'Chat restored to the list.' : 'Chat archived.');
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function handleDeleteChat() {
    if (!activeChat || !window.confirm(`Delete “${activeChat.name}” and its messages? This cannot be undone.`)) return;
    try {
      await deleteChat.mutateAsync({ chatId: activeChat.id });
      await client.invalidateQueries({ queryKey: getListChatsQueryKey() });
      setModal(null);
      setNotice('Chat deleted.');
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeChat || !addMemberId) return;
    try {
      const updated = await addChatMembers.mutateAsync({ chatId: activeChat.id, data: { userIds: [addMemberId] } });
      client.setQueryData<Chat[]>(getListChatsQueryKey(), (old) => old?.map((chat) => chat.id === updated.id ? updated : chat));
      await client.invalidateQueries({ queryKey: getListChatsQueryKey() });
      setAddMemberId('');
      setNotice('Member added.');
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function removeMember(person: ChatMember) {
    if (!activeChat || !window.confirm(`Remove ${getDisplayName(person)} from this chat?`)) return;
    try {
      await removeChatMember.mutateAsync({ chatId: activeChat.id, userId: person.internalId });
      await client.invalidateQueries({ queryKey: getListChatsQueryKey() });
      setNotice(`${getDisplayName(person)} removed.`);
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure('');
    try {
      let profilePhotoPath: string | null | undefined;
      if (profileFile) profilePhotoPath = await uploadPhoto(profileFile, 'profile');
      const updated = await updateProfile.mutateAsync({
        data: { displayName: displayName.trim(), about: about.trim() || null, ...(profilePhotoPath ? { profilePhotoPath } : {}) },
      });
      const previous = client.getQueryData<CurrentSession>(getGetSessionQueryKey());
      if (previous) client.setQueryData(getGetSessionQueryKey(), { ...previous, user: updated });
      await client.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      setProfileFile(null);
      setNotice('Your profile is up to date.');
      setModal(null);
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function handleLogout() {
    try {
      await logout.mutateAsync();
      client.setQueryData(getGetSessionQueryKey(), { user: null });
      client.removeQueries({ queryKey: getListChatsQueryKey() });
      client.removeQueries({ queryKey: getListAdminUsersQueryKey() });
      setSelectedChatId('');
      setScreen('chats');
      setMobileConversation(false);
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function handleResetPassword(internalId: string, loginId: string) {
    if (!window.confirm(`Reset the password for ${loginId}?`)) return;
    try {
      const result = await resetPassword.mutateAsync({ userId: internalId });
      setTemporaryPassword(`${loginId}: ${result.temporaryPassword}`);
      setNotice('One-time password generated. Share it with the resident directly.');
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function changeRole(person: User) {
    if (!isOwner || person.role === 'owner') return;
    const role = person.role === 'admin' ? 'user' : 'admin';
    try {
      await setUserRole.mutateAsync({ userId: person.internalId, data: { role } });
      await client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      setNotice(`${person.displayName || person.loginId} is now ${role === 'admin' ? 'an admin' : 'a resident'}.`);
    } catch (error) {
      setFailure(errorText(error));
    }
  }

  async function handleMobileSignIn(event: FormEvent<HTMLFormElement>) {
    await handleLogin(event);
  }

  if (sessionQuery.isLoading) return <LoadingScreen />;

  const sessionOffline = sessionQuery.isError && (sessionQuery.error as { status?: number } | null)?.status !== 401;
  if (!user) return <main className="login-screen">
    <form className="login-card" onSubmit={handleMobileSignIn} data-testid="form-sign-in">
      <Logo />
      <div className="login-kicker">THE HOUSE HAS A GROUP CHAT</div>
      <h1 className="login-title">Good to have you back.</h1>
      <p className="login-subtitle">Sign in with the account made for you by your hostel owner.</p>
      {failure && <div className="form-error" role="alert" data-testid="status-login-error"><AlertCircle size={16}/>{failure}</div>}
      {sessionOffline && <div className="form-error" role="alert" data-testid="status-session-error"><AlertCircle size={16}/><span>HostelX is having trouble connecting. {errorText(sessionQuery.error)}</span><button className="icon-button" type="button" aria-label="Retry connection" onClick={() => void sessionQuery.refetch()} data-testid="button-retry-session"><RefreshCw size={14}/></button></div>}
      <label className="field-label" htmlFor="login-id">Account ID</label>
      <input className="field-input" id="login-id" data-testid="input-login-id" autoComplete="username" placeholder="user1.hostelx.in" value={loginId} onChange={(event) => setLoginId(event.target.value)} required />
      <label className="field-label" htmlFor="login-password">Password</label>
      <input className="field-input" id="login-password" data-testid="input-login-password" autoComplete="current-password" type="password" placeholder="Your HostelX password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      <button className="primary-btn login-submit" data-testid="button-sign-in" type="submit" disabled={loginSubmitting}>{loginSubmitting ? <LoaderCircle className="spin" size={16}/> : null} Sign in <ChevronRight size={16}/></button>
      <div className="login-note"><LockKeyhole size={13}/> Your account is private to your hostel.</div>
    </form>
  </main>;

  const setupRequired = user.firstLogin;
  const requestPending = createChat.isPending || updateChat.isPending || deleteChat.isPending || addChatMembers.isPending || removeChatMember.isPending || busyUpload;

  return <main className="app-shell" data-testid="hostelx-app">
    <div className="app-frame">
      <aside className="rail">
        <Logo />
        <div className="nav-label">Your HostelX</div>
        <button className={`nav-item ${screen === 'chats' ? 'active' : ''}`} onClick={() => { setScreen('chats'); setMobileConversation(false); }} data-testid="nav-chats"><MessageCircle size={17}/><span>Chats</span><span className="nav-count">{accessibleChats.length}</span></button>
        {isAdmin && <button className={`nav-item ${screen === 'management' ? 'active' : ''}`} onClick={() => { setScreen('management'); setMobileConversation(false); }} data-testid="nav-management"><ShieldCheck size={17}/><span>Manage chats</span></button>}
        <div className="rail-section">
          <div className="section-head"><span>Assigned chats</span>{isAdmin && <button className="icon-button" aria-label="Create a chat" onClick={openCreateChat} data-testid="button-create-chat-rail"><Plus size={16}/></button>}</div>
          {accessibleChats.slice(0, 8).map((chat) => <button type="button" key={chat.id} className={`group-link ${selectedChatId === chat.id ? 'group-link-active' : ''}`} onClick={() => { setSelectedChatId(chat.id); setScreen('chats'); setMobileConversation(true); }} data-testid={`rail-chat-${chat.id}`}><div className="group-mini"><Users size={13}/></div><span className="group-name">{chat.name}</span></button>)}
        </div>
        <div className="rail-bottom">
          <button className="me-card" onClick={() => { setDisplayName(user.displayName ?? ''); setAbout(user.about ?? ''); setProfileFile(null); setModal('profile'); setFailure(''); }} data-testid="button-open-profile">
            <Avatar person={user} size="small"/><span className="me-info"><span className="me-name">{getDisplayName(user)}</span><span className="me-status">{user.displayId ?? user.loginId}</span></span><Settings2 size={16}/>
          </button>
          <button className="signout-link" onClick={handleLogout} disabled={logout.isPending} data-testid="button-sign-out"><LogOut size={15}/> Sign out</button>
        </div>
      </aside>

      {screen === 'chats' ? <section className="chat-list" aria-label="Assigned chats">
        <div className="list-top">
          <div className="list-title-line"><div><div className="eyebrow">YOUR HOUSE</div><h1 className="list-title">Chats</h1></div><button className="mobile-profile-button" aria-label="Open profile" onClick={() => { setDisplayName(user.displayName ?? ''); setAbout(user.about ?? ''); setModal('profile'); }} data-testid="button-mobile-profile"><Avatar person={user} size="small"/></button></div>
          <label className="searchbox"><Search size={15}/><input aria-label="Search chats" data-testid="input-search-chats" placeholder="Find a group" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
        </div>
        <div className="chat-scroll">
          {chatsQuery.isLoading ? <div className="list-skeleton" data-testid="loading-chat-list">{[0,1,2,3].map((row) => <div className="skeleton-chat" key={row}><div className="skeleton-circle"/><div className="skeleton-copy"><div/><div/></div></div>)}</div> :
          chatsQuery.isError ? <div className="list-state"><AlertCircle size={20}/><strong>Your chats did not load.</strong><span>{errorText(chatsQuery.error)}</span><button className="secondary-btn" onClick={() => void chatsQuery.refetch()} data-testid="button-retry-chats"><RefreshCw size={14}/> Try again</button></div> :
          filteredChats.length ? filteredChats.map((chat) => {
            const last = chat.id === selectedChatId ? messages.at(-1) : undefined;
            return <button type="button" key={chat.id} className={`chat-row ${selectedChatId === chat.id ? 'selected' : ''}`} onClick={() => { setSelectedChatId(chat.id); setMobileConversation(true); }} data-testid={`chat-row-${chat.id}`}>
              <div className="chat-avatar"><ChatAvatar chat={chat}/></div>
              <span className="chat-row-content"><span className="chat-row-top"><span className="chat-row-title">{chat.name}{chat.archived && <span className="archive-tag">ARCHIVED</span>}</span><span className="chat-time">{last ? formatTime(last.createdAt) : ''}</span></span><span className="chat-preview">{last ? `${last.senderName}: ${last.text}` : `${chat.members.length} housemates · Private conversation`}</span></span>
            </button>;
          }) : <div className="empty-state" data-testid="empty-chat-list"><div className="empty-mark"><Users size={23}/></div><h2>{search ? 'Nothing by that name' : 'No assigned chats yet'}</h2><p>{search ? 'Try another group name.' : isAdmin ? 'Make a first chat for your housemates.' : 'Your hostel admin will add you to a chat.'}</p>{isAdmin && !search && <button className="primary-btn" onClick={openCreateChat} data-testid="button-create-first-chat"><Plus size={15}/> Create a chat</button>}</div>}
        </div>
        <MobileNav screen={screen} isAdmin={Boolean(isAdmin)} setScreen={(next) => { setScreen(next); setMobileConversation(false); }} onCreate={openCreateChat}/>
      </section> : <section className="chat-list admin-chat-list">
        <div className="list-top"><div className="list-title-line"><div><div className="eyebrow">HOUSE TOOLS</div><h1 className="list-title">Management</h1></div><button className="mobile-profile-button" aria-label="Open profile" onClick={() => setModal('profile')} data-testid="button-management-profile"><Avatar person={user} size="small"/></button></div></div>
        <div className="management-menu">
          <div className="management-menu-item current"><span className="menu-icon"><MessageCircle size={17}/></span><span><strong>All chats</strong><small>Rename, group and organize</small></span><span className="menu-count">{chatList.length}</span></div>
          {isOwner && <div className="management-menu-item"><span className="menu-icon"><Users size={17}/></span><span><strong>Accounts</strong><small>Owner account directory</small></span><span className="menu-count">{adminUsersQuery.data?.length ?? '—'}</span></div>}
          <div className="management-note"><ShieldCheck size={15}/><span>Only the people who run the house can manage its chats.</span></div>
        </div>
        <MobileNav screen={screen} isAdmin={Boolean(isAdmin)} setScreen={(next) => { setScreen(next); setMobileConversation(false); }} onCreate={openCreateChat}/>
      </section>}

      {screen === 'chats' ? <section className={`conversation ${mobileConversation ? 'mobile-visible' : ''}`} data-testid="conversation-panel">
        {activeChat ? <>
          <header className="conversation-header">
            <button className="icon-button mobile-back" aria-label="Back to chats" onClick={() => setMobileConversation(false)} data-testid="button-back-to-chats"><ArrowLeft size={18}/></button>
            <div className="chat-header-avatar"><ChatAvatar chat={activeChat}/></div>
            <div className="conversation-heading"><div className="conversation-title" data-testid="text-active-chat">{activeChat.name}</div><div className="conversation-sub" data-testid="text-chat-members">{activeChat.members.length} {activeChat.members.length === 1 ? 'member' : 'members'} · {activeChat.members.slice(0, 3).map(getDisplayName).join(', ')}</div></div>
            {isAdmin && <button className="icon-button" aria-label="Manage this chat" onClick={openManageChat} data-testid="button-manage-chat"><MoreHorizontal size={20}/></button>}
          </header>
          <div className="message-area" ref={messageAreaRef} data-testid="message-list">
            <div className="day-marker"><span className="day-mark-line"/><span>Messages in {activeChat.name}</span><span className="day-mark-line"/></div>
            {messagesQuery.isLoading ? <div className="message-loading" data-testid="loading-messages">{[0,1,2].map((item) => <div className={`message-skeleton ${item % 2 ? 'right' : ''}`} key={item}><div/><div/></div>)}</div> :
            messagesQuery.isError ? <div className="list-state message-error"><AlertCircle size={20}/><strong>Could not open this conversation.</strong><span>{errorText(messagesQuery.error)}</span><button className="secondary-btn" onClick={() => void messagesQuery.refetch()} data-testid="button-retry-messages"><RefreshCw size={14}/> Try again</button></div> :
            messages.length ? messages.map((message, index) => {
              const own = message.senderId === user.internalId;
              const prev = messages[index - 1];
              const newSender = !own && prev?.senderId !== message.senderId;
              const person = activeChat.members.find((member) => member.internalId === message.senderId);
              return <div className={`message ${own ? 'own' : ''}`} key={message.id} data-testid={`message-${message.id}`}>
                {!own && (newSender ? <Avatar person={person ?? { internalId:message.senderId, loginId:message.senderName, displayName:message.senderName, displayId:null, role:'user', profilePhotoPath:null }} size="tiny"/> : <span className="avatar-spacer"/>)}
                <div className="message-stack">{newSender && <div className="message-sender">{message.senderName}</div>}<div className="message-bubble">{message.text}</div><div className="message-meta"><span>{formatTime(message.createdAt)}</span>{own && <Check size={12}/>}</div></div>
              </div>;
            }) : <div className="empty-conversation" data-testid="empty-message-list"><div className="empty-mark"><MessageCircle size={24}/></div><h2>Room for a first message</h2><p>Start the conversation with your housemates.</p></div>}
          </div>
          <div className="composer-wrap"><form className="composer" onSubmit={handleSend} data-testid="form-send-message"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${activeChat.name}`} aria-label="Write a message" maxLength={4000} data-testid="input-message"/><span className="composer-limit">{draft.length > 0 ? `${draft.length}/4000` : ''}</span><button className="send-button" type="submit" aria-label="Send message" disabled={!draft.trim() || sendMessage.isPending} data-testid="button-send-message">{sendMessage.isPending ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>}</button></form><div className="composer-caption">A private space for your housemates</div></div>
        </> : <div className="welcome-pane"><div className="welcome-inner"><div className="welcome-orb"><MessageCircle size={38}/></div><div className="welcome-title">Your house, in one conversation.</div><p className="welcome-copy">{chatsQuery.isLoading ? 'Bringing your chats in…' : 'Choose a group to catch up with your housemates.'}</p>{isAdmin && <button className="primary-btn" onClick={openCreateChat} data-testid="button-welcome-new-chat"><Plus size={15}/> Start a chat</button>}</div></div>}
      </section> : <section className="conversation admin-panel mobile-visible" data-testid="chat-management">
        <div className="admin-heading"><div><div className="eyebrow">FOR THE HOUSE</div><h1 className="admin-title">Keep the right people together.</h1><p className="admin-caption">Manage the chats your residents share.</p></div><button className="primary-btn" onClick={openCreateChat} data-testid="button-create-chat"><Plus size={15}/> New chat</button></div>
        {failure && <div className="form-error" role="alert" data-testid="status-management-error"><AlertCircle size={16}/>{failure}<button className="icon-button" aria-label="Dismiss error" onClick={() => setFailure('')} data-testid="button-dismiss-error"><X size={14}/></button></div>}
        <div className="management-layout">
          <div className="admin-section management-chat-section">
            <div className="admin-section-head"><div><h3>Chats</h3><span className="admin-caption">Assigned circles for your hostel</span></div><span className="section-total">{chatList.length}</span></div>
            {chatsQuery.isLoading ? <div className="admin-loading">{[0,1,2].map((item) => <div className="skeleton-chat" key={item}><div className="skeleton-circle"/><div className="skeleton-copy"><div/><div/></div></div>)}</div> :
              chatList.length ? <div className="management-chat-list">{chatList.map((chat) => <button type="button" className={`management-chat-row ${activeChat?.id === chat.id ? 'current' : ''}`} key={chat.id} onClick={() => { setSelectedChatId(chat.id); setChatName(chat.name); setChatFile(null); setAddMemberId(''); setFailure(''); setModal('manage-chat'); }} data-testid={`management-chat-${chat.id}`}><ChatAvatar chat={chat}/><span className="management-chat-info"><strong>{chat.name}</strong><small>{chat.members.length} members {chat.archived ? '· archived' : ''}</small></span><ChevronRight size={16}/></button>)}</div> :
              <div className="empty-admin"><Users size={23}/><strong>No chats to manage yet</strong><span>Create a private chat for your house.</span></div>}
          </div>
          {isOwner && <div className="admin-section accounts-section">
            <div className="admin-section-head"><div><h3>Hostel accounts</h3><span className="admin-caption">The original account and chosen identity</span></div><span className="section-total">{adminUsersQuery.data?.length ?? '—'}</span></div>
            {adminUsersQuery.isLoading ? <div className="account-skeleton"><div className="skeleton-chat"/><div className="skeleton-chat"/><div className="skeleton-chat"/></div> :
            adminUsersQuery.isError ? <div className="list-state"><AlertCircle size={18}/><span>{errorText(adminUsersQuery.error)}</span><button className="secondary-btn" onClick={() => void adminUsersQuery.refetch()} data-testid="button-retry-users"><RefreshCw size={14}/> Retry</button></div> :
            <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Account</th><th>Display name</th><th>Display ID</th><th>Role</th><th>Actions</th></tr></thead><tbody>{(adminUsersQuery.data ?? []).map((person) => <tr key={person.internalId} data-testid={`admin-user-${person.internalId}`}><td className="account-login">{person.loginId}</td><td>{person.displayName || <span className="muted-cell">Not set up</span>}</td><td>{person.displayId || <span className="muted-cell">Pending</span>}</td><td><span className={`role-chip ${person.role === 'owner' ? 'owner' : ''}`}>{person.role}</span></td><td><div className="row-actions"><button className="table-action" onClick={() => void handleResetPassword(person.internalId, person.loginId)} data-testid={`button-reset-password-${person.internalId}`}><KeyRound size={13}/><span>Reset password</span></button>{person.role !== 'owner' && <button className="table-action" onClick={() => void changeRole(person)} data-testid={`button-toggle-role-${person.internalId}`}>{person.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>}</div></td></tr>)}</tbody></table></div>}
          </div>}
          {isAdmin && !isOwner && <div className="admin-section accounts-section"><div className="admin-section-head"><div><h3>Accounts</h3><span className="admin-caption">Only the owner can see the full account directory.</span></div></div><div className="owner-only-note"><ShieldCheck size={22}/><p>Reset passwords for housemates from a chat’s member list. Account-wide details stay with the owner.</p></div></div>}
        </div>
        <MobileNav screen={screen} isAdmin setScreen={(next) => { setScreen(next); setMobileConversation(false); }} onCreate={openCreateChat}/>
      </section>}
    </div>

    {notice && <div className="toast-note" role="status" data-testid="status-success"><Check size={15}/>{notice}<button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')} data-testid="button-dismiss-notice"><X size={14}/></button></div>}
    {temporaryPassword && <div className="toast-note temp-password-toast" role="status" data-testid="status-temporary-password"><KeyRound size={15}/><span><strong>One-time password</strong><br/>{temporaryPassword}</span><button className="icon-button" aria-label="Dismiss temporary password" onClick={() => setTemporaryPassword('')} data-testid="button-dismiss-password"><X size={14}/></button></div>}
    {failure && screen === 'chats' && modal !== 'profile' && modal !== 'create-chat' && modal !== 'manage-chat' && <div className="toast-note toast-error" role="alert" data-testid="status-error"><AlertCircle size={15}/>{failure}<button className="icon-button" aria-label="Dismiss error" onClick={() => setFailure('')} data-testid="button-dismiss-error"><X size={14}/></button></div>}

    {modal === 'create-chat' && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><form className="dialog" onSubmit={handleCreateChat} data-testid="form-create-chat">
      <div className="dialog-title-row"><div><div className="dialog-kicker">A NEW CIRCLE</div><h2 className="dialog-title">Start a house chat</h2><p className="dialog-desc">Bring the right people into a shared space.</p></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setModal(null)} data-testid="button-close-create-chat"><X size={18}/></button></div>
      {failure && <div className="form-error" role="alert" data-testid="status-create-chat-error"><AlertCircle size={15}/>{failure}</div>}
      <label className="field-label" htmlFor="new-chat-name">Chat name</label><input className="field-input" id="new-chat-name" maxLength={80} placeholder="Kitchen table, floor 2..." value={chatName} onChange={(event) => setChatName(event.target.value)} data-testid="input-chat-name" required/>
      <label className="field-label" htmlFor={chatInputId}>Chat photo <span className="optional-label">Optional, up to 5 MB</span></label><input id={chatInputId} type="file" className="file-input" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setChatFile(event.target.files?.[0] ?? null)} data-testid="input-chat-photo"/><label className="upload-picker" htmlFor={chatInputId}><ImagePlus size={16}/><span>{chatFile?.name ?? 'Choose a chat photo'}</span></label>
      <div className="field-label">Add members <span className="optional-label">{memberIds.length} selected</span></div>
      <div className="member-options" data-testid="chat-member-picker">{allPeople.map((person) => <label className={`member-option ${memberIds.includes(person.internalId) ? 'checked' : ''}`} key={person.internalId}><input type="checkbox" checked={memberIds.includes(person.internalId)} onChange={() => setMemberIds((old) => old.includes(person.internalId) ? old.filter((id) => id !== person.internalId) : [...old, person.internalId])} data-testid={`checkbox-create-member-${person.internalId}`}/><Avatar person={person} size="tiny"/><span className="member-option-name">{getDisplayName(person)}<small>{person.displayId || person.loginId}</small></span>{memberIds.includes(person.internalId) && <Check size={15}/>}</label>)}</div>
      {!allPeople.length && <p className="form-hint">The account directory is not available yet. Add a resident account before creating a chat.</p>}
      <div className="dialog-actions"><button type="button" className="secondary-btn" onClick={() => setModal(null)} data-testid="button-cancel-create-chat">Cancel</button><button type="submit" className="primary-btn" disabled={requestPending || !allPeople.length} data-testid="button-submit-create-chat">{requestPending ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>} Create chat</button></div>
    </form></div>}

    {modal === 'manage-chat' && activeChat && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><div className="dialog manage-dialog" data-testid="dialog-manage-chat">
      <div className="dialog-title-row"><div><div className="dialog-kicker">CHAT SETTINGS</div><h2 className="dialog-title">{activeChat.name}</h2><p className="dialog-desc">Keep the right people in this corner of the house.</p></div><button className="icon-button" aria-label="Close chat settings" onClick={() => setModal(null)} data-testid="button-close-manage-chat"><X size={18}/></button></div>
      {failure && <div className="form-error" role="alert" data-testid="status-manage-chat-error"><AlertCircle size={15}/>{failure}</div>}
      <form onSubmit={handleRenameChat} data-testid="form-update-chat"><label className="field-label" htmlFor="rename-chat">Chat name</label><div className="inline-edit"><input id="rename-chat" className="field-input" maxLength={80} value={chatName} onChange={(event) => setChatName(event.target.value)} data-testid="input-rename-chat" required/><button type="submit" className="secondary-btn" disabled={requestPending} data-testid="button-save-chat-details">Save</button></div><label className="field-label" htmlFor="manage-chat-photo">Change photo <span className="optional-label">Optional</span></label><input id="manage-chat-photo" className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setChatFile(event.target.files?.[0] ?? null)} data-testid="input-manage-chat-photo"/><label className="upload-picker" htmlFor="manage-chat-photo"><ImagePlus size={16}/><span>{chatFile?.name ?? 'Choose a new chat photo'}</span></label></form>
      <div className="members-block"><div className="members-block-head"><strong>Members</strong><span>{activeChat.members.length}</span></div>{activeChat.members.map((person) => <div className="manage-member" key={person.internalId} data-testid={`chat-member-${person.internalId}`}><Avatar person={person} size="tiny"/><span className="member-option-name">{getDisplayName(person)}<small>{person.displayId || person.loginId}</small></span><div className="member-actions">{isAdmin && person.role !== 'owner' && <><button className="member-remove" aria-label={`Reset password for ${getDisplayName(person)}`} onClick={() => void handleResetPassword(person.internalId, person.loginId)} data-testid={`button-reset-member-password-${person.internalId}`}><KeyRound size={14}/></button><button className="member-remove" aria-label={`Remove ${getDisplayName(person)}`} onClick={() => void removeMember(person)} data-testid={`button-remove-member-${person.internalId}`}><UserMinus size={15}/></button></>}</div></div>)}</div>
      {availableToAdd.length > 0 && <form className="add-member-form" onSubmit={addMember} data-testid="form-add-member"><select className="field-input" aria-label="Choose a resident to add" value={addMemberId} onChange={(event) => setAddMemberId(event.target.value)} data-testid="select-add-member"><option value="">Choose a resident to add</option>{availableToAdd.map((person) => <option key={person.internalId} value={person.internalId}>{getDisplayName(person)} · {person.displayId || person.loginId}</option>)}</select><button className="secondary-btn" type="submit" disabled={!addMemberId || requestPending} data-testid="button-add-member"><UserPlus size={14}/> Add</button></form>}
      <div className="chat-admin-actions"><button className="secondary-btn" onClick={() => void toggleArchive()} disabled={requestPending} data-testid="button-toggle-archive"><Archive size={14}/>{activeChat.archived ? 'Restore chat' : 'Archive chat'}</button><button className="danger-btn" onClick={() => void handleDeleteChat()} disabled={requestPending} data-testid="button-delete-chat"><Trash2 size={14}/> Delete chat</button></div>
    </div></div>}

    {modal === 'profile' && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><form className="dialog" onSubmit={handleProfileSave} data-testid="form-profile">
      <div className="dialog-title-row"><div><div className="dialog-kicker">YOUR IDENTITY HERE</div><h2 className="dialog-title">Profile</h2><p className="dialog-desc">Your account stays yours; this is how housemates know you.</p></div><button className="icon-button" type="button" aria-label="Close profile" onClick={() => setModal(null)} data-testid="button-close-profile"><X size={18}/></button></div>
      {failure && <div className="form-error" role="alert" data-testid="status-profile-error"><AlertCircle size={15}/>{failure}</div>}
      <div className="profile-identity"><Avatar person={user} size="normal"/><div><strong>{user.loginId}</strong><span>Permanent account · {user.displayId || 'Display ID pending'}</span></div></div>
      <label className="field-label" htmlFor="profile-display-name">Display name</label><input className="field-input" id="profile-display-name" maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} data-testid="input-profile-name" required/>
      <div className="display-id-preview"><span>Chosen display ID</span><strong data-testid="text-display-id">{user.displayId || 'Will be assigned after saving'}</strong><small>The server creates a unique ID if this name is already taken.</small></div>
      <label className="field-label" htmlFor="profile-about">About you <span className="optional-label">Optional</span></label><textarea className="field-input profile-about" id="profile-about" maxLength={240} placeholder="A small detail housemates might like to know" value={about} onChange={(event) => setAbout(event.target.value)} data-testid="input-profile-about"/>
      <label className="field-label" htmlFor={profileInputId}>Profile photo <span className="optional-label">Optional</span></label><input id={profileInputId} type="file" className="file-input" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setProfileFile(event.target.files?.[0] ?? null)} data-testid="input-profile-photo"/><label className="upload-picker" htmlFor={profileInputId}><ImagePlus size={16}/><span>{profileFile?.name ?? (user.profilePhotoPath ? 'Choose a different photo' : 'Choose a profile photo')}</span></label>
      <div className="dialog-actions"><button type="button" className="secondary-btn" onClick={() => setModal(null)} data-testid="button-cancel-profile">Cancel</button><button type="submit" className="primary-btn" disabled={updateProfile.isPending || busyUpload} data-testid="button-save-profile">{updateProfile.isPending || busyUpload ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>} Save profile</button></div>
    </form></div>}

    {setupRequired && <div className="overlay setup-overlay"><form className="dialog setup-dialog" onSubmit={handleSetup} data-testid="form-first-login-setup">
      <div className="setup-step"><span className="setup-step-number">01</span><span>YOUR FIRST HELLO</span></div><div className="setup-ornament"><UserRound size={22}/></div>
      <h1 className="setup-title">Make it feel like you.</h1><p className="setup-copy">Your account is ready. Set the name your housemates will know, then create a password of your own.</p>
      {failure && <div className="form-error" role="alert" data-testid="status-setup-error"><AlertCircle size={15}/>{failure}</div>}
      <label className="field-label" htmlFor="setup-display-name">Display name</label><input className="field-input" id="setup-display-name" maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="The name people call you" data-testid="input-setup-display-name" required/>
      <div className="display-id-preview setup-display-id"><span>Your account stays</span><strong data-testid="text-login-id">{user.loginId}</strong><small>Your chosen display ID is assigned when setup is complete.</small></div>
      <label className="field-label" htmlFor="setup-password">New password</label><input className="field-input" id="setup-password" autoComplete="new-password" type="password" minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" data-testid="input-new-password" required/>
      <label className="field-label" htmlFor="setup-confirm-password">Confirm password</label><input className="field-input" id="setup-confirm-password" autoComplete="new-password" type="password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it once more" data-testid="input-confirm-password" required/>
      <label className="field-label" htmlFor="setup-about">A little about you <span className="optional-label">Optional</span></label><textarea id="setup-about" className="field-input profile-about" maxLength={240} value={about} onChange={(event) => setAbout(event.target.value)} placeholder="Anything your housemates should know" data-testid="input-setup-about"/>
      <label className="field-label" htmlFor="setup-photo">Profile photo <span className="optional-label">Optional</span></label><input id="setup-photo" className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setProfileFile(event.target.files?.[0] ?? null)} data-testid="input-setup-photo"/><label className="upload-picker" htmlFor="setup-photo"><ImagePlus size={16}/><span>{profileFile?.name ?? 'Add a profile photo'}</span></label>
      <button className="primary-btn setup-submit" type="submit" disabled={completeSetup.isPending || busyUpload} data-testid="button-complete-setup">{completeSetup.isPending || busyUpload ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} Set up my account</button>
      <p className="setup-footnote"><LockKeyhole size={13}/> Your login ID never changes. Passwords are managed by HostelX.</p>
    </form></div>}
  </main>;
}

function ChatAvatar({ chat }: { chat: Chat }) {
  const photo = imageUrl(chat.photoPath);
  return <span className="chat-avatar-art" data-testid={`avatar-chat-${chat.id}`}>{photo ? <img src={photo} alt="" /> : <Users size={18}/>}</span>;
}

function MobileNav({ screen, isAdmin, setScreen, onCreate }: { screen: string; isAdmin: boolean; setScreen: (screen: 'chats' | 'management') => void; onCreate: () => void }) {
  return <nav className="mobile-bar" aria-label="Main navigation">
    <button className={`mobile-tab ${screen === 'chats' ? 'active' : ''}`} onClick={() => setScreen('chats')} data-testid="mobile-tab-chats"><MessageCircle/><span>Chats</span></button>
    {isAdmin && <button className={`mobile-tab ${screen === 'management' ? 'active' : ''}`} onClick={() => setScreen('management')} data-testid="mobile-tab-management"><ShieldCheck/><span>Manage</span></button>}
    {isAdmin && <button className="mobile-tab mobile-new-chat" onClick={onCreate} data-testid="mobile-tab-new-chat"><Plus/><span>New chat</span></button>}
  </nav>;
}

function App() {
  return <QueryClientProvider client={queryClient}><AppContent/></QueryClientProvider>;
}

export default App;
