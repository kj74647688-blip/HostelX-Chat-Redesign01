import { useMemo, useState, type FormEvent } from 'react';
import {
  MessageCircle, Users, Phone, Search, Plus, Send, Video, MoreVertical,
  ArrowLeft, X, ShieldCheck, LogOut, Check, PhoneOff, Mic, MicOff,
  Camera, CameraOff, UserPlus, Sparkles,
} from 'lucide-react';

type User = { id: string; login: string; name: string; role: 'admin' | 'resident'; firstLogin: boolean; color: string };
type Group = { id: string; name: string; memberIds: string[]; password: string; };
type Message = { chatId: string; sender: string; text: string; time: string; };
type CallStatus = { state: 'idle' | 'connecting' | 'failed' | 'incoming' | 'active'; recipient: string; message: string };

const seedUsers: User[] = [
  { id:'u1', login:'maya', name:'Maya Chen', role:'resident', firstLogin:false, color:'purple' },
  { id:'u2', login:'leo', name:'Leo Martins', role:'resident', firstLogin:false, color:'coral' },
  { id:'u3', login:'amira', name:'Amira Okafor', role:'resident', firstLogin:false, color:'mint' },
  { id:'u4', login:'noah', name:'Noah Kim', role:'resident', firstLogin:false, color:'amber' },
  { id:'u5', login:'sofia', name:'Sofia Reyes', role:'resident', firstLogin:false, color:'purple' },
  { id:'u6', login:'admin', name:'Rae Wilson', role:'admin', firstLogin:false, color:'mint' },
  { id:'u7', login:'jules', name:'Jules Martin', role:'resident', firstLogin:true, color:'coral' },
];
const initialGroups: Group[] = [
  { id:'g1', name:'Maple House', memberIds:['u1','u2','u3','u4','u5','u6'], password:'maple' },
  { id:'g2', name:'Kitchen regulars', memberIds:['u1','u2','u4','u6'], password:'stove' },
  { id:'g3', name:'Floor 3', memberIds:['u1','u3','u5','u6','u7'], password:'floor3' },
];
const initialMessages: Message[] = [
  { chatId:'g1', sender:'u2', text:'Anyone up for the market after class?', time:'10:42' },
  { chatId:'g1', sender:'u3', text:'Yes! I need to pick up a few things. Meet in the lobby?', time:'10:45' },
  { chatId:'g1', sender:'u1', text:'I’m in. Give me ten minutes to finish this reading.', time:'10:47' },
  { chatId:'g1', sender:'u4', text:'Perfect, I’ll bring the tote bags this time.', time:'10:50' },
  { chatId:'g1', sender:'u2', text:'Noah, you are officially in charge of bags now.', time:'10:51' },
  { chatId:'g2', sender:'u4', text:'Pasta night in the kitchen at 7?', time:'09:18' },
  { chatId:'g2', sender:'u2', text:'Count me in. I’ll bring tomatoes.', time:'09:24' },
  { chatId:'g3', sender:'u3', text:'Quiet hours start at 10 tonight, just a heads up.', time:'Yesterday' },
];

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function Avatar({ user, size = 'normal' }: { user: User; size?: 'normal' | 'small' | 'tiny' }) {
  return <div className={`avatar ${user.color} ${size === 'small' ? 'small' : size === 'tiny' ? 'tiny' : ''}`} aria-label={user.name} data-testid={`avatar-${user.id}`}>{initials(user.name)}</div>;
}

function Logo() {
  return <div className="brand"><div className="brand-mark"><MessageCircle size={19} strokeWidth={2.6} /></div><div className="brand-word">Hostel<span>X</span></div></div>;
}

function App() {
  const [users, setUsers] = useState<User[]>(seedUsers);
  const [currentUserId, setCurrentUserId] = useState<string | null>('u1');
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selectedChat, setSelectedChat] = useState('g1');
  const [screen, setScreen] = useState<'chats' | 'groups' | 'calls' | 'admin'>('chats');
  const [mobileConversation, setMobileConversation] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [modal, setModal] = useState<'group' | 'call' | 'setup' | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupPassword, setGroupPassword] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [call, setCall] = useState<CallStatus>({ state:'idle', recipient:'', message:'' });
  const [callRecipient, setCallRecipient] = useState('');
  const [callMuted, setCallMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const currentUser = users.find((user) => user.id === currentUserId) ?? null;
  const visibleGroups = useMemo(() => groups.filter((group) => currentUser && group.memberIds.includes(currentUser.id)), [groups, currentUser]);
  const activeGroup = groups.find((group) => group.id === selectedChat);
  const chatMessages = messages.filter((message) => message.chatId === selectedChat);
  const otherMembers = activeGroup ? activeGroup.memberIds.filter((id) => id !== currentUser?.id).map((id) => users.find((user) => user.id === id)).filter((user): user is User => Boolean(user)) : [];
  const filteredGroups = visibleGroups.filter((group) => {
    const latest = [...messages].reverse().find((message) => message.chatId === group.id);
    return group.name.toLowerCase().includes(search.toLowerCase()) || latest?.text.toLowerCase().includes(search.toLowerCase());
  });

  function signIn(event: FormEvent) {
    event.preventDefault();
    const login = loginName.trim().toLowerCase();
    let user = users.find((item) => item.login === login);
    if (!user) {
      user = { id:`u${Date.now()}`, login, name:loginName.trim(), role:'resident', firstLogin:true, color:'mint' };
      setUsers((old) => [...old, user!]);
    }
    setCurrentUserId(user.id);
    setLoginPass('');
    if (user.firstLogin) setModal('setup');
  }
  function finishSetup(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) return;
    setUsers((old) => old.map((user) => user.id === currentUser.id ? { ...user, name:loginName.trim() || user.name, firstLogin:false } : user));
    setModal(null);
    setScreen('chats');
  }
  function openChat(id: string) {
    setSelectedChat(id);
    setScreen('chats');
    setMobileConversation(true);
  }
  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !currentUser || !activeGroup) return;
    const time = new Intl.DateTimeFormat('en', { hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date());
    setMessages((old) => [...old, { chatId:activeGroup.id, sender:currentUser.id, text, time }]);
    setDraft('');
  }
  function createGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim() || !groupPassword.trim() || !currentUser) return;
    const id = `g${Date.now()}`;
    const memberIds = Array.from(new Set([currentUser.id, ...selectedMembers]));
    setGroups((old) => [...old, { id, name:groupName.trim(), memberIds, password:groupPassword }]);
    setGroupName('');
    setGroupPassword('');
    setSelectedMembers([]);
    setModal(null);
    openChat(id);
  }
  function startCall(user: User) {
    setCallRecipient(user.id);
    setCall({ state:'failed', recipient:user.name, message:'Call service unavailable. The /api/calls endpoint could not be reached. Your chat is still here; try again when calling is back.' });
  }

  if (!currentUser) return (
    <div className="login-screen">
      <form className="login-card" onSubmit={signIn}>
        <Logo />
        <div className="login-title">Your people, all in one place.</div>
        <div className="login-subtitle">A little corner of the internet for the people you share a hallway with.</div>
        <label className="field-label" htmlFor="login-name">Your hostel login</label>
        <input className="field-input" id="login-name" data-testid="input-login" autoComplete="username" placeholder="Try maya or admin" value={loginName} onChange={(event) => setLoginName(event.target.value)} required />
        <label className="field-label" htmlFor="login-password">Password</label>
        <input className="field-input" id="login-password" data-testid="input-password" autoComplete="current-password" type="password" placeholder="Any password for this local demo" value={loginPass} onChange={(event) => setLoginPass(event.target.value)} required />
        <button className="primary-btn" data-testid="button-sign-in" type="submit" style={{ width:'100%', marginTop:20 }}>Sign in <ArrowLeft size={15} style={{ transform:'rotate(180deg)' }} /></button>
        <div className="login-note">Local demo only — accounts and chats stay in this browser. No shared or secure sign-in.</div>
      </form>
    </div>
  );

  const latestPreview = (group: Group) => {
    const latest = [...messages].reverse().find((message) => message.chatId === group.id);
    const sender = latest ? users.find((user) => user.id === latest.sender) : null;
    return latest ? `${sender?.id === currentUser.id ? 'You' : sender?.name.split(' ')[0]}: ${latest.text}` : 'Start a conversation together';
  };

  return (
    <main className="app-shell" data-testid="hostelx-app">
      <div className="app-frame">
        <aside className="rail">
          <Logo />
          <div className="nav-label">Your space</div>
          <button className={`nav-item ${screen === 'chats' ? 'active' : ''}`} onClick={() => { setScreen('chats'); setMobileConversation(false); }} data-testid="nav-chats"><MessageCircle size={17}/><span>Chats</span><span className="nav-count">{visibleGroups.length}</span></button>
          <button className={`nav-item ${screen === 'groups' ? 'active' : ''}`} onClick={() => { setScreen('groups'); setMobileConversation(false); }} data-testid="nav-groups"><Users size={17}/><span>Groups</span></button>
          <button className={`nav-item ${screen === 'calls' ? 'active' : ''}`} onClick={() => { setScreen('calls'); setMobileConversation(false); setModal('call'); }} data-testid="nav-calls"><Phone size={17}/><span>Calls</span></button>
          {currentUser.role === 'admin' && <button className={`nav-item ${screen === 'admin' ? 'active' : ''}`} onClick={() => { setScreen('admin'); setMobileConversation(false); }} data-testid="nav-admin"><ShieldCheck size={17}/><span>Admin</span></button>}
          <div className="rail-section">
            <div className="section-head"><span>Your groups</span><button className="icon-button" aria-label="Create a group" onClick={() => setModal('group')} data-testid="button-create-group"><Plus size={16}/></button></div>
            {visibleGroups.map((group, index) => <div key={group.id} className="group-link" onClick={() => openChat(group.id)} data-testid={`rail-group-${group.id}`}><div className={`avatar tiny ${['purple','coral','mint'][index % 3]}`}><Users size={13}/></div><span className="group-name">{group.name}</span></div>)}
          </div>
          <div className="rail-section">
            <div className="section-head"><span>Around right now</span><span className="online-dot"/></div>
            <div className="online-list">{users.filter((user) => user.id !== currentUser.id).slice(0,5).map((user) => <div className="online-person" key={user.id}><Avatar user={user} size="tiny"/><span>{user.name.split(' ')[0]}</span><span className="online-dot"/></div>)}</div>
          </div>
          <div className="rail-bottom">
            <div className="me-card"><Avatar user={currentUser} size="small"/><div className="me-info"><div className="me-name" data-testid="text-current-user">{currentUser.name}</div><div className="me-status">{currentUser.role === 'admin' ? 'Hostel admin' : 'Here at home'}</div></div><button className="icon-button" aria-label="Sign out" onClick={() => { setCurrentUserId(null); setScreen('chats'); }} data-testid="button-sign-out"><LogOut size={16}/></button></div>
          </div>
        </aside>

        {screen !== 'admin' ? <section className="chat-list" aria-label="Your chats">
          <div className="list-top">
            <div className="list-title-line"><div className="list-title">{screen === 'groups' ? 'Your groups' : screen === 'calls' ? 'Calls' : 'Your chats'}</div><button className="icon-button" title="Create group" onClick={() => setModal('group')} data-testid="button-create-group-list"><Plus size={18}/></button></div>
            <label className="searchbox"><Search size={15}/><input aria-label="Search chats and groups" data-testid="input-search-chats" placeholder="Search chats or groups" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
          </div>
          <div className="chat-scroll">
            {filteredGroups.length ? filteredGroups.map((group, index) => {
              const last = [...messages].reverse().find((message) => message.chatId === group.id);
              const people = group.memberIds.filter((id) => id !== currentUser.id).map((id) => users.find((user) => user.id === id)).filter((user): user is User => Boolean(user));
              return <div key={group.id} role="button" tabIndex={0} onClick={() => openChat(group.id)} onKeyDown={(event) => { if (event.key === 'Enter') openChat(group.id); }} className={`chat-row ${selectedChat === group.id && !mobileConversation ? 'selected' : ''}`} data-testid={`chat-row-${group.id}`}>
                <div className={`avatar ${['purple','coral','mint','amber'][index % 4]}`}><Users size={19}/></div>
                <div className="chat-row-content"><div className="chat-row-top"><div className="chat-row-title">{group.name}</div><div className="chat-time">{last?.time ?? ''}</div></div><div className="chat-preview">{latestPreview(group)}</div></div>
                {people.length > 0 && <div className="unread" aria-label={`${people.length} group members`}>{people.length}</div>}
              </div>;
            }) : <div className="welcome-pane"><div><div className="welcome-title">No groups found</div><p className="welcome-copy">Try a different search, or start a new little corner.</p><button className="primary-btn" onClick={() => setModal('group')} data-testid="button-empty-create-group"><Plus size={15}/> New group</button></div></div>}
          </div>
          <div className="mobile-bar">
            <button className={`mobile-tab ${screen === 'chats' ? 'active' : ''}`} onClick={() => setScreen('chats')} data-testid="mobile-tab-chats"><MessageCircle/><span>Chats</span></button>
            <button className={`mobile-tab ${screen === 'groups' ? 'active' : ''}`} onClick={() => setScreen('groups')} data-testid="mobile-tab-groups"><Users/><span>Groups</span></button>
            <button className="mobile-tab" onClick={() => { setScreen('calls'); setModal('call'); }} data-testid="mobile-tab-calls"><Phone/><span>Calls</span></button>
            {currentUser.role === 'admin' && <button className="mobile-tab" onClick={() => { setScreen('admin'); setMobileConversation(false); }} data-testid="mobile-tab-admin"><ShieldCheck/><span>Admin</span></button>}
          </div>
        </section> : <section className="chat-list" aria-label="Admin users and groups">
          <div className="admin-panel" style={{ padding:'19px 15px' }}>
            <div className="list-title-line"><div className="list-title">Admin</div><button className="icon-button" aria-label="Create group" onClick={() => setModal('group')} data-testid="admin-create-group"><Plus size={18}/></button></div>
            <div className="admin-caption">Manage your hostel circle.</div>
            <div className="admin-section" style={{ marginTop:22 }}><div className="admin-section-head"><h3>Members</h3><span className="chat-time">{users.length} total</span></div>{users.map((user) => <div className="group-link" key={user.id}><Avatar user={user} size="tiny"/><span className="group-name">{user.name}</span><span className="chat-time">{user.role}</span></div>)}</div>
            <button className="primary-btn" onClick={() => setModal('group')} data-testid="admin-create-group-cta"><Plus size={15}/> Create group</button>
          </div>
          <div className="mobile-bar">
            <button className="mobile-tab" onClick={() => setScreen('chats')} data-testid="mobile-admin-to-chats"><MessageCircle/><span>Chats</span></button>
            <button className="mobile-tab" onClick={() => setScreen('groups')} data-testid="mobile-admin-to-groups"><Users/><span>Groups</span></button>
            <button className="mobile-tab" onClick={() => { setScreen('calls'); setModal('call'); }} data-testid="mobile-admin-to-calls"><Phone/><span>Calls</span></button>
            <button className="mobile-tab active" data-testid="mobile-admin-current"><ShieldCheck/><span>Admin</span></button>
          </div>
        </section>}

        {screen === 'admin' ? <section className="conversation admin-panel" data-testid="admin-dashboard">
          <div className="admin-heading"><div><div className="admin-title">A little housekeeping</div><div className="admin-caption">Your residents and their corners, all in one place.</div></div><button className="secondary-btn" onClick={() => setModal('group')} data-testid="admin-create-group-main"><Plus size={15}/> New group</button></div>
          <div className="admin-stats"><div className="stat-card"><div className="stat-label">Residents</div><div className="stat-value">{users.length}</div></div><div className="stat-card"><div className="stat-label">Groups</div><div className="stat-value">{groups.length}</div></div><div className="stat-card"><div className="stat-label">First day here</div><div className="stat-value">{users.filter((user) => user.firstLogin).length}</div></div></div>
          <div className="admin-section"><div className="admin-section-head"><h3>People in the house</h3><span className="chat-time">Local demo data</span></div><div style={{ overflowX:'auto' }}><table className="users-table"><thead><tr><th>Resident</th><th>Login</th><th>Role</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} data-testid={`admin-user-${user.id}`}><td><div className="user-table-name"><Avatar user={user} size="tiny"/><span>{user.name}</span></div></td><td>{user.login}</td><td><span className="role-chip">{user.role}</span></td></tr>)}</tbody></table></div></div>
          <div className="admin-section"><div className="admin-section-head"><h3>Groups in the house</h3><span className="chat-time">{groups.length} circles</span></div><div className="admin-groups">{groups.map((group) => <div className="admin-group-card" key={group.id} data-testid={`admin-group-${group.id}`}><b>{group.name}</b><span>{group.memberIds.length} members · Password protected</span></div>)}</div></div>
          <div className="call-alert">This is a local browser demo. Changes are not shared with other residents and group passwords are not secure.</div>
        </section> : <section className={`conversation ${mobileConversation ? 'mobile-visible' : ''}`} data-testid="conversation-panel">
          {activeGroup ? <>
            <header className="conversation-header">
              <button className="icon-button mobile-back" aria-label="Back to chats" onClick={() => setMobileConversation(false)} data-testid="button-back-to-chats"><ArrowLeft size={18}/></button>
              <div className="avatar small purple"><Users size={16}/></div><div className="conversation-heading"><div className="conversation-title" data-testid="text-active-chat">{activeGroup.name}</div><div className="conversation-sub" data-testid="text-group-members">{activeGroup.memberIds.length} housemates · {otherMembers.slice(0,3).map((user) => user.name.split(' ')[0]).join(', ')}</div></div>
              <div className="header-actions"><button className="icon-button" title="Start a call" onClick={() => { setCallRecipient(''); setModal('call'); }} data-testid="button-open-call"><Video size={18}/></button><button className="icon-button" title="Group details" onClick={() => setModal('group')} data-testid="button-group-details"><MoreVertical size={18}/></button></div>
            </header>
            <div className="message-area" data-testid="message-list">
              <div className="day-marker">Today, in the house</div>
              {chatMessages.map((message, index) => {
                const sender = users.find((user) => user.id === message.sender);
                const own = message.sender === currentUser.id;
                const previous = chatMessages[index - 1];
                const showSender = !own && previous?.sender !== message.sender;
                return <div className={`message ${own ? 'own' : ''}`} key={`${message.chatId}-${index}`} data-testid={`message-${message.chatId}-${index}`}>
                  {!own && (showSender ? <Avatar user={sender ?? seedUsers[0]} size="tiny"/> : <div style={{ width:27, flexShrink:0 }}/>)}
                  <div><div className="message-bubble">{showSender && <div className="message-sender">{sender?.name.split(' ')[0]}</div>}{message.text}</div><div className="message-meta"><span>{message.time}</span>{own && <Check size={12}/>}</div></div>
                </div>;
              })}
              {chatMessages.length === 0 && <div className="welcome-pane"><div><div className="welcome-title">The first hello is yours.</div><p className="welcome-copy">Send a note to get this corner of the house started.</p></div></div>}
            </div>
            <div className="composer-wrap"><form className="composer" onSubmit={sendMessage} data-testid="form-send-message"><button className="icon-button" type="button" aria-label="Message options" onClick={() => document.querySelector<HTMLInputElement>('[data-testid="input-message"]')?.focus()} data-testid="button-message-options"><Plus size={19}/></button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${activeGroup.name}`} aria-label="Write a message" data-testid="input-message"/><button className="send-button" type="submit" aria-label="Send message" data-testid="button-send-message"><Send size={17}/></button></form></div>
          </> : <div className="welcome-pane"><div className="welcome-inner"><div className="welcome-orb"><MessageCircle size={42}/></div><div className="welcome-title">Good things happen down the hall.</div><p className="welcome-copy">Pick one of your groups to drop in, catch up, or make a plan.</p><button className="primary-btn" onClick={() => setModal('group')} data-testid="button-welcome-create"><Plus size={15}/> Make a group</button></div></div>}
        </section>}
      </div>

      {modal === 'group' && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><form className="dialog" onSubmit={createGroup} data-testid="form-create-group">
        <div className="dialog-title-row"><div><div className="dialog-title">Make a little group</div><div className="dialog-desc">A private corner for your housemates to make plans.</div></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setModal(null)} data-testid="button-close-group"><X size={18}/></button></div>
        <label className="field-label" htmlFor="group-name">Group name</label><input id="group-name" className="field-input" placeholder="Kitchen regulars, floor 3..." value={groupName} onChange={(event) => setGroupName(event.target.value)} data-testid="input-group-name" required/>
        <label className="field-label" htmlFor="group-password">Group password</label><input id="group-password" className="field-input" placeholder="A shared word to join" value={groupPassword} onChange={(event) => setGroupPassword(event.target.value)} data-testid="input-group-password" required/>
        <label className="field-label">Bring some people along <span style={{ color:'#8390a9', fontWeight:400 }}>({selectedMembers.length} picked)</span></label>
        <div className="member-options">{users.filter((user) => user.id !== currentUser.id).map((user) => <label className={`member-option ${selectedMembers.includes(user.id) ? 'checked' : ''}`} key={user.id}><input type="checkbox" checked={selectedMembers.includes(user.id)} onChange={() => setSelectedMembers((old) => old.includes(user.id) ? old.filter((id) => id !== user.id) : [...old, user.id])} data-testid={`checkbox-member-${user.id}`}/><Avatar user={user} size="tiny"/><span style={{ flex:1 }}>{user.name}</span>{selectedMembers.includes(user.id) && <Check size={15}/>}</label>)}</div>
        <div className="dialog-actions"><button type="button" className="secondary-btn" onClick={() => setModal(null)} data-testid="button-cancel-group">Not now</button><button type="submit" className="primary-btn" data-testid="button-submit-group"><UserPlus size={15}/> Create group</button></div>
        <div className="login-note">Demo only: the group and password live in this browser.</div>
      </form></div>}

      {modal === 'setup' && <div className="overlay"><form className="dialog" onSubmit={finishSetup} data-testid="form-first-login"><div className="dialog-title-row"><div><div className="dialog-title">Welcome to the house</div><div className="dialog-desc">First things first — what should your housemates call you?</div></div><div className="welcome-orb" style={{ width:42,height:42,borderRadius:14,margin:0 }}><Sparkles size={19}/></div></div><label className="field-label" htmlFor="setup-name">Your name</label><input id="setup-name" className="field-input" value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder={currentUser.name} data-testid="input-setup-name" required/><div className="call-alert" style={{ marginTop:15 }}>Your profile is saved locally in this browser. This is not a shared account yet.</div><div className="dialog-actions"><button className="primary-btn" type="submit" data-testid="button-finish-setup">Let’s go <ArrowLeft size={15} style={{ transform:'rotate(180deg)' }}/></button></div></form></div>}

      {modal === 'call' && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><div className="dialog" data-testid="dialog-call">
        <div className="dialog-title-row"><div><div className="dialog-title">{call.state === 'active' ? 'You’re on a call' : 'Catch someone in real time'}</div><div className="dialog-desc">Choose a housemate to start a video call.</div></div><button className="icon-button" aria-label="Close call" onClick={() => setModal(null)} data-testid="button-close-call"><X size={18}/></button></div>
        {call.state === 'active' ? <><div style={{ padding:'24px 0',textAlign:'center' }}><div className="welcome-orb" style={{ width:82,height:82,borderRadius:28 }}><Video size={33}/></div><div className="welcome-title" style={{ fontSize:20 }}>{call.recipient}</div><div className="conversation-sub">Local call preview · no video service connected</div></div><div className="call-controls"><button className="call-control" aria-label={callMuted ? 'Unmute microphone' : 'Mute microphone'} onClick={() => setCallMuted((value) => !value)} data-testid="button-toggle-mic">{callMuted ? <MicOff/> : <Mic/>}</button><button className="call-control" aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} onClick={() => setCameraOff((value) => !value)} data-testid="button-toggle-camera">{cameraOff ? <CameraOff/> : <Camera/>}</button><button className="call-control end" aria-label="End call" onClick={() => { setCall({ state:'idle', recipient:'', message:'' }); setModal(null); }} data-testid="button-end-call"><PhoneOff/></button></div></> :
          <>
            {call.state === 'incoming' && <div className="call-alert ready">Incoming call from {call.recipient}. This demo has no live audio or video.</div>}
            <div className="recipient-list">{users.filter((user) => user.id !== currentUser.id).map((user) => <button className="recipient-row" key={user.id} onClick={() => { setCallRecipient(user.id); startCall(user); }} data-testid={`button-call-${user.id}`}><Avatar user={user} size="small"/><span className="recipient-copy"><b>{user.name}</b><span>{user.role === 'admin' ? 'Hostel admin' : 'Housemate'}</span></span><Video size={18}/></button>)}</div>
            {call.state === 'failed' && <div className="call-alert" data-testid="status-call-failed"><b>Couldn’t start the call</b><br/>{call.message}<div className="call-controls" style={{ marginTop:12 }}><button className="secondary-btn" onClick={() => setCall({ state:'idle', recipient:'', message:'' })} data-testid="button-dismiss-call-error">Okay</button><button className="primary-btn" onClick={() => { const user = users.find((entry) => entry.id === callRecipient); if (user) startCall(user); }} data-testid="button-retry-call">Try again</button></div></div>}
            {call.state === 'idle' && <><div className="login-note">Calls connect through /api/calls. This browser demo keeps a clear failure state if that service is unavailable.</div><button className="secondary-btn" style={{ width:'100%',marginTop:12 }} onClick={() => { const caller = users.find((user) => user.id !== currentUser.id); setCall({ state:'incoming', recipient:caller?.name ?? 'Housemate', message:'Incoming call' }); }} data-testid="button-demo-incoming-call"><Phone size={14}/> Preview incoming call</button></>}
            {call.state === 'incoming' && <div className="call-controls"><button className="call-control end" aria-label="Decline call" onClick={() => setCall({ state:'idle', recipient:'', message:'' })} data-testid="button-decline-call"><PhoneOff/></button><button className="call-control" aria-label="Answer call" onClick={() => setCall({ ...call, state:'active' })} data-testid="button-answer-call"><Video/></button></div>}
          </>}
      </div></div>}
    </main>
  );
}

export default App;
