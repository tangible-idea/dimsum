import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { buildDeviceManifest, webFlashSupported } from '../lib/firmwarePatch';
import './AdminPage.css';

const DEFAULT_SUPA_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ebpkbakjgzxfahsvrldk.supabase.co';
const DEFAULT_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVicGtiYWtqZ3p4ZmFoc3ZybGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTMzNjE5MjEsImV4cCI6MjAyODkzNzkyMX0.XnL0RGQyHIiDnZdfrgKTBBYy5Nu13dWU44pKxw4Wq_o';

export default function AdminPage() {
  const [serviceKey, setServiceKey] = useState(() => {
    return (
      import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
      localStorage.getItem('clicker_admin_service_role_key') ||
      ''
    );
  });
  const [inputKey, setInputKey] = useState('');
  const [showKeyBanner, setShowKeyBanner] = useState(!serviceKey);

  const [tab, setTab] = useState('devices'); // 'devices' | 'profiles' | 'friendships' | 'pokes'
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  // Data state
  const [devices, setDevices] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [gameStates, setGameStates] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [pokes, setPokes] = useState([]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all'); // all | assigned | unassigned
  const [friendFilter, setFriendFilter] = useState('all'); // all | accepted | pending | blocked
  const [pokeFilter, setPokeFilter] = useState('all'); // all | pending | consumed

  // Modals state
  const [modal, setModal] = useState(null); // { type, data }

  const notify = (msg, type = 'success') => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Admin Client
  const adminClient = useMemo(() => {
    const keyToUse = serviceKey.trim() || DEFAULT_ANON_KEY;
    return createClient(DEFAULT_SUPA_URL, keyToUse, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, [serviceKey]);

  const isServiceRole = Boolean(serviceKey.trim());

  const handleSaveKey = () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      localStorage.removeItem('clicker_admin_service_role_key');
      setServiceKey('');
      notify('Service Role Key가 제거되었습니다 (기본 Anon 모드)', 'success');
    } else {
      localStorage.setItem('clicker_admin_service_role_key', trimmed);
      setServiceKey(trimmed);
      setInputKey('');
      setShowKeyBanner(false);
      notify('Service Role Key가 저장되었습니다!', 'success');
    }
  };

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [devRes, profRes, gsRes, frRes, pokeRes] = await Promise.all([
        adminClient.from('clicker_devices').select('*').order('created_at', { ascending: false }),
        adminClient.from('clicker_profiles').select('*').order('created_at', { ascending: false }),
        adminClient.from('clicker_game_states').select('*'),
        adminClient.from('clicker_friendships').select('*').order('created_at', { ascending: false }),
        adminClient.from('clicker_pokes').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

      if (devRes.error) console.error('Devices error:', devRes.error);
      if (profRes.error) console.error('Profiles error:', profRes.error);
      if (gsRes.error) console.error('GameStates error:', gsRes.error);
      if (frRes.error) console.error('Friendships error:', frRes.error);
      if (pokeRes.error) console.error('Pokes error:', pokeRes.error);

      setDevices(devRes.data || []);
      setProfiles(profRes.data || []);
      setGameStates(gsRes.data || []);
      setFriendships(frRes.data || []);
      setPokes(pokeRes.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
      notify('데이터를 불러오는 중 오류가 발생했습니다: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [adminClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Profiles Map for quick lookup
  const profileMap = useMemo(() => {
    const map = new Map();
    for (const p of profiles) {
      map.set(p.id, p);
    }
    return map;
  }, [profiles]);

  // GameState Map
  const gameStateMap = useMemo(() => {
    const map = new Map();
    for (const gs of gameStates) {
      map.set(gs.owner_id, gs);
    }
    return map;
  }, [gameStates]);

  // Devices per user
  const devicesByOwner = useMemo(() => {
    const map = new Map();
    for (const d of devices) {
      if (d.owner_id) {
        if (!map.has(d.owner_id)) map.set(d.owner_id, []);
        map.get(d.owner_id).push(d);
      }
    }
    return map;
  }, [devices]);

  // Stats
  const stats = useMemo(() => {
    const totalDevices = devices.length;
    const assignedDevices = devices.filter((d) => d.owner_id).length;
    const totalUsers = profiles.length;
    const totalFriends = friendships.length;
    const acceptedFriends = friendships.filter((f) => f.status === 'accepted').length;
    const pendingPokes = pokes.filter((p) => !p.consumed_at).length;
    return { totalDevices, assignedDevices, totalUsers, totalFriends, acceptedFriends, pendingPokes };
  }, [devices, profiles, friendships, pokes]);

  // -------------------------------------------------------------
  // Actions: Devices
  // -------------------------------------------------------------
  const handleUnassignDevice = async (device) => {
    if (!window.confirm(`[${device.device_code}] 기기의 소유자 할당을 해제하시겠습니까?\n(유저 소유권이 해제되고 미등록 상태로 변경됩니다)`)) return;
    try {
      const { error } = await adminClient
        .from('clicker_devices')
        .update({ owner_id: null, registered: false })
        .eq('id', device.id);
      if (error) throw error;
      notify(`[${device.device_code}] 기기 유저 할당이 해제되었습니다.`);
      fetchData();
    } catch (err) {
      notify('할당 해제 실패: ' + err.message, 'error');
    }
  };

  const handleAssignDevice = async (deviceId, newOwnerId) => {
    try {
      const { error } = await adminClient
        .from('clicker_devices')
        .update({ owner_id: newOwnerId || null, registered: Boolean(newOwnerId) })
        .eq('id', deviceId);
      if (error) throw error;
      notify('기기 소유자가 성공적으로 변경되었습니다.');
      setModal(null);
      fetchData();
    } catch (err) {
      notify('기기 소유자 변경 실패: ' + err.message, 'error');
    }
  };

  const handleEditDeviceLabel = async (deviceId, label) => {
    try {
      const { error } = await adminClient
        .from('clicker_devices')
        .update({ label })
        .eq('id', deviceId);
      if (error) throw error;
      notify('기기 라벨이 수정되었습니다.');
      setModal(null);
      fetchData();
    } catch (err) {
      notify('라벨 수정 실패: ' + err.message, 'error');
    }
  };

  const handleCreateDevice = async (deviceCode, label) => {
    try {
      const { error } = await adminClient.from('clicker_devices').insert([
        {
          device_code: deviceCode.trim().toUpperCase(),
          label: label.trim() || null,
          registered: false,
        },
      ]);
      if (error) throw error;
      notify(`새 기기 [${deviceCode}] 등록 완료!`);
      setModal(null);
      fetchData();
    } catch (err) {
      notify('기기 등록 실패: ' + err.message, 'error');
    }
  };

  const handleDeleteDevice = async (device) => {
    if (!window.confirm(`정말 [${device.device_code}] 기기를 영구 삭제하시겠습니까?`)) return;
    try {
      const { error } = await adminClient.from('clicker_devices').delete().eq('id', device.id);
      if (error) throw error;
      notify(`[${device.device_code}] 기기가 삭제되었습니다.`);
      fetchData();
    } catch (err) {
      notify('기기 삭제 실패: ' + err.message, 'error');
    }
  };

  // -------------------------------------------------------------
  // Actions: Friendships
  // -------------------------------------------------------------
  const handleUpdateFriendStatus = async (friendshipId, newStatus) => {
    try {
      const { error } = await adminClient
        .from('clicker_friendships')
        .update({ status: newStatus })
        .eq('id', friendshipId);
      if (error) throw error;
      notify(`친구 상태가 '${newStatus}'(으)로 변경되었습니다.`);
      fetchData();
    } catch (err) {
      notify('상태 변경 실패: ' + err.message, 'error');
    }
  };

  const handleDeleteFriendship = async (friendship) => {
    if (!window.confirm('해당 친구 관계를 삭제하시겠습니까?')) return;
    try {
      const { error } = await adminClient.from('clicker_friendships').delete().eq('id', friendship.id);
      if (error) throw error;
      notify('친구 관계가 삭제되었습니다.');
      fetchData();
    } catch (err) {
      notify('친구 삭제 실패: ' + err.message, 'error');
    }
  };

  const handleCreateFriendship = async (reqId, addId, status = 'accepted') => {
    if (!reqId || !addId || reqId === addId) {
      notify('서로 다른 두 유저를 선택해주세요.', 'error');
      return;
    }
    try {
      const { error } = await adminClient.from('clicker_friendships').insert([
        { requester_id: reqId, addressee_id: addId, status },
      ]);
      if (error) throw error;
      notify('친구 관계가 생성되었습니다.');
      setModal(null);
      fetchData();
    } catch (err) {
      notify('친구 생성 실패: ' + err.message, 'error');
    }
  };

  // -------------------------------------------------------------
  // Actions: Pokes
  // -------------------------------------------------------------
  const handleTogglePokeConsumed = async (poke) => {
    try {
      const nextConsumed = poke.consumed_at ? null : new Date().toISOString();
      const { error } = await adminClient
        .from('clicker_pokes')
        .update({ consumed_at: nextConsumed })
        .eq('id', poke.id);
      if (error) throw error;
      notify(nextConsumed ? 'Poke가 소비 완료 처리되었습니다.' : 'Poke가 대기 중으로 복구되었습니다.');
      fetchData();
    } catch (err) {
      notify('Poke 상태 변경 실패: ' + err.message, 'error');
    }
  };

  const handleDeletePoke = async (pokeId) => {
    try {
      const { error } = await adminClient.from('clicker_pokes').delete().eq('id', pokeId);
      if (error) throw error;
      notify('Poke 항목이 삭제되었습니다.');
      fetchData();
    } catch (err) {
      notify('Poke 삭제 실패: ' + err.message, 'error');
    }
  };

  const handleClearAllPendingPokes = async () => {
    if (!window.confirm('현재 대기 중인 모든 Poke를 일괄 소비 완료 처리하시겠습니까?')) return;
    try {
      const { error } = await adminClient
        .from('clicker_pokes')
        .update({ consumed_at: new Date().toISOString() })
        .is('consumed_at', null);
      if (error) throw error;
      notify('모든 대기 중 Poke가 소비 처리되었습니다.');
      fetchData();
    } catch (err) {
      notify('처리 실패: ' + err.message, 'error');
    }
  };

  const handleSendTestPoke = async (fromUser, toUser) => {
    if (!fromUser || !toUser || fromUser === toUser) {
      notify('송신 유저와 수신 유저를 서로 다르게 선택해주세요.', 'error');
      return;
    }
    try {
      const { error } = await adminClient.from('clicker_pokes').insert([
        { from_user: fromUser, to_user: toUser },
      ]);
      if (error) throw error;
      notify('Poke가 성공적으로 전송되었습니다.');
      setModal(null);
      fetchData();
    } catch (err) {
      notify('Poke 전송 실패: ' + err.message, 'error');
    }
  };

  // -------------------------------------------------------------
  // Actions: Profiles & GameStates
  // -------------------------------------------------------------
  const handleUpdateProfile = async (userId, nickname, slug) => {
    try {
      const { error } = await adminClient
        .from('clicker_profiles')
        .update({ nickname: nickname.trim() || null, slug: slug.trim() || null })
        .eq('id', userId);
      if (error) throw error;
      notify('프로필 정보가 수정되었습니다.');
      setModal(null);
      fetchData();
    } catch (err) {
      notify('프로필 수정 실패: ' + err.message, 'error');
    }
  };

  const handleUpdateGameState = async (userId, values) => {
    try {
      const { error } = await adminClient
        .from('clicker_game_states')
        .update(values)
        .eq('owner_id', userId);
      if (error) throw error;
      notify('게임 상태가 수정되었습니다.');
      setModal(null);
      fetchData();
    } catch (err) {
      notify('게임 상태 수정 실패: ' + err.message, 'error');
    }
  };

  const handleDeleteProfile = async (profile) => {
    if (!window.confirm(`[${profile.nickname || profile.id}] 유저 프로필 및 관련 게임 데이터를 삭제하시겠습니까?`)) return;
    try {
      const { error } = await adminClient.from('clicker_profiles').delete().eq('id', profile.id);
      if (error) throw error;
      notify('프로필이 삭제되었습니다.');
      fetchData();
    } catch (err) {
      notify('프로필 삭제 실패: ' + err.message, 'error');
    }
  };

  // -------------------------------------------------------------
  // Filtered views
  // -------------------------------------------------------------
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const q = searchQuery.toLowerCase();
      const codeMatch = d.device_code?.toLowerCase().includes(q);
      const labelMatch = d.label?.toLowerCase().includes(q);
      const ownerNick = profileMap.get(d.owner_id)?.nickname || '';
      const ownerMatch = ownerNick.toLowerCase().includes(q) || d.owner_id?.toLowerCase().includes(q);
      const searchOk = !q || codeMatch || labelMatch || ownerMatch;

      if (!searchOk) return false;
      if (deviceFilter === 'assigned') return Boolean(d.owner_id);
      if (deviceFilter === 'unassigned') return !d.owner_id;
      return true;
    });
  }, [devices, searchQuery, deviceFilter, profileMap]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const q = searchQuery.toLowerCase();
      const nickMatch = p.nickname?.toLowerCase().includes(q);
      const slugMatch = p.slug?.toLowerCase().includes(q);
      const idMatch = p.id?.toLowerCase().includes(q);
      return !q || nickMatch || slugMatch || idMatch;
    });
  }, [profiles, searchQuery]);

  const filteredFriendships = useMemo(() => {
    return friendships.filter((f) => {
      const q = searchQuery.toLowerCase();
      const reqNick = profileMap.get(f.requester_id)?.nickname || '';
      const addNick = profileMap.get(f.addressee_id)?.nickname || '';
      const searchOk =
        !q ||
        reqNick.toLowerCase().includes(q) ||
        addNick.toLowerCase().includes(q) ||
        f.requester_id?.toLowerCase().includes(q) ||
        f.addressee_id?.toLowerCase().includes(q);

      if (!searchOk) return false;
      if (friendFilter !== 'all') return f.status === friendFilter;
      return true;
    });
  }, [friendships, searchQuery, friendFilter, profileMap]);

  const filteredPokes = useMemo(() => {
    return pokes.filter((p) => {
      const q = searchQuery.toLowerCase();
      const fromNick = profileMap.get(p.from_user)?.nickname || '';
      const toNick = profileMap.get(p.to_user)?.nickname || '';
      const searchOk =
        !q ||
        fromNick.toLowerCase().includes(q) ||
        toNick.toLowerCase().includes(q) ||
        p.from_user?.toLowerCase().includes(q) ||
        p.to_user?.toLowerCase().includes(q);

      if (!searchOk) return false;
      if (pokeFilter === 'pending') return !p.consumed_at;
      if (pokeFilter === 'consumed') return Boolean(p.consumed_at);
      return true;
    });
  }, [pokes, searchQuery, pokeFilter, profileMap]);

  const formatTime = (ts) => {
    if (!ts) return '-';
    try {
      const d = new Date(ts);
      return d.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="adm-root">
      {/* Toast */}
      {toastMsg && <div className={`adm-toast ${toastMsg.type}`}>{toastMsg.text}</div>}

      {/* Header */}
      <header className="adm-header">
        <div className="adm-header-left">
          <div className="adm-logo">
            <span>⚙️ Clicker Admin</span>
            <span className={`adm-badge ${isServiceRole ? 'admin' : 'anon'}`}>
              {isServiceRole ? 'Full Admin (Service Role)' : 'Anon Client (RLS Active)'}
            </span>
          </div>
        </div>

        <div className="adm-header-right">
          <button
            className="adm-btn ghost sm"
            onClick={() => setShowKeyBanner((prev) => !prev)}
          >
            🔑 {isServiceRole ? 'API Key 설정 변경' : 'Service Role Key 입력'}
          </button>
          <button
            className={`adm-btn sm ${autoRefresh ? 'primary' : 'ghost'}`}
            onClick={() => setAutoRefresh((prev) => !prev)}
          >
            ⏱️ 자동갱신: {autoRefresh ? 'ON (10초)' : 'OFF'}
          </button>
          <button className="adm-btn primary sm" onClick={fetchData} disabled={loading}>
            {loading ? '새로고침 중...' : '🔄 새로고침'}
          </button>
          <a href="/" className="adm-btn ghost sm">
            🏠 유저 앱으로 이동
          </a>
        </div>
      </header>

      {/* Service Role Key Banner */}
      {showKeyBanner && (
        <div className="adm-main" style={{ paddingBottom: 0 }}>
          <div className="adm-banner">
            <div className="adm-banner-row">
              <div>
                <b style={{ fontSize: 14 }}>Supabase Service Role Key 설정</b>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  모든 유저/기기 조회 및 RLS 우회(유저 할당 해제, 친구 수정, Poke 관리 등)를 위해 Supabase 대시보드의{' '}
                  <code>service_role secret</code> 키를 입력하세요. 브라우저 localStorage에만 저장됩니다.
                </p>
              </div>
            </div>
            <div className="adm-key-input">
              <input
                type="password"
                className="adm-input"
                placeholder={serviceKey ? '현재 Service Role Key 등록됨 (새 키 입력하여 변경)' : 'eyJhbGciOi... (service_role secret)'}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
              />
              <button className="adm-btn primary" onClick={handleSaveKey}>
                저장
              </button>
              {serviceKey && (
                <button
                  className="adm-btn danger"
                  onClick={() => {
                    localStorage.removeItem('clicker_admin_service_role_key');
                    setServiceKey('');
                    setInputKey('');
                    notify('키가 초기화되었습니다.');
                  }}
                >
                  초기화
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="adm-main">
        {/* Stats Row */}
        <div className="adm-stats">
          <div className="adm-stat-card">
            <span className="adm-stat-label">총 기기 (Devices)</span>
            <span className="adm-stat-val">{stats.totalDevices}</span>
            <span className="adm-stat-sub">할당됨: {stats.assignedDevices} / 미할당: {stats.totalDevices - stats.assignedDevices}</span>
          </div>
          <div className="adm-stat-card">
            <span className="adm-stat-label">등록 유저 (Profiles)</span>
            <span className="adm-stat-val">{stats.totalUsers}</span>
            <span className="adm-stat-sub">구글 로그인 유저 프로필</span>
          </div>
          <div className="adm-stat-card">
            <span className="adm-stat-label">친구 관계 (Friendships)</span>
            <span className="adm-stat-val">{stats.totalFriends}</span>
            <span className="adm-stat-sub">수락됨: {stats.acceptedFriends} / 대기: {stats.totalFriends - stats.acceptedFriends}</span>
          </div>
          <div className="adm-stat-card">
            <span className="adm-stat-label">대기 중 Poke (Pending Pokes)</span>
            <span className="adm-stat-val" style={{ color: stats.pendingPokes > 0 ? '#fbbf24' : '#34d399' }}>
              {stats.pendingPokes}
            </span>
            <span className="adm-stat-sub">기기 미수신/미표시 항목</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="adm-tabs">
          <button
            className={`adm-tab-btn ${tab === 'devices' ? 'active' : ''}`}
            onClick={() => { setTab('devices'); setSearchQuery(''); }}
          >
            📱 기기 관리 (Devices) <span className="adm-tab-count">{filteredDevices.length}</span>
          </button>
          <button
            className={`adm-tab-btn ${tab === 'profiles' ? 'active' : ''}`}
            onClick={() => { setTab('profiles'); setSearchQuery(''); }}
          >
            👤 유저 & 게임 (Users) <span className="adm-tab-count">{filteredProfiles.length}</span>
          </button>
          <button
            className={`adm-tab-btn ${tab === 'friendships' ? 'active' : ''}`}
            onClick={() => { setTab('friendships'); setSearchQuery(''); }}
          >
            🤝 친구 관계 (Friendships) <span className="adm-tab-count">{filteredFriendships.length}</span>
          </button>
          <button
            className={`adm-tab-btn ${tab === 'pokes' ? 'active' : ''}`}
            onClick={() => { setTab('pokes'); setSearchQuery(''); }}
          >
            👉 Poke 메시지 (Pokes) <span className="adm-tab-count">{filteredPokes.length}</span>
          </button>
        </div>

        {/* TAB 1: DEVICES */}
        {tab === 'devices' && (
          <div>
            <div className="adm-controls">
              <div className="adm-search-box">
                <input
                  type="text"
                  className="adm-input"
                  placeholder="기기 코드, 라벨, 유저 닉네임 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  className="adm-select"
                  value={deviceFilter}
                  onChange={(e) => setDeviceFilter(e.target.value)}
                >
                  <option value="all">전체 상태</option>
                  <option value="assigned">할당됨 (Assigned)</option>
                  <option value="unassigned">미할당 (Unassigned)</option>
                </select>
              </div>
              <div>
                <button
                  className="adm-btn primary"
                  onClick={() => setModal({ type: 'create_device' })}
                >
                  ➕ 신규 기기 등록
                </button>
              </div>
            </div>

            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Device Code</th>
                    <th>라벨</th>
                    <th>소유자 (Owner)</th>
                    <th>등록 여부</th>
                    <th>Device Secret</th>
                    <th>최근 접속 (Last Seen)</th>
                    <th>생성일</th>
                    <th>관리 액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="adm-empty">
                        조회된 기기가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((d) => {
                      const owner = profileMap.get(d.owner_id);
                      return (
                        <tr key={d.id}>
                          <td>
                            <span className="adm-code">{d.device_code}</span>
                          </td>
                          <td>
                            {d.label || <span style={{ color: '#64748b' }}>-</span>}
                            <button
                              className="adm-btn ghost sm"
                              style={{ marginLeft: 6, padding: '2px 4px' }}
                              onClick={() => setModal({ type: 'edit_device_label', data: d })}
                              title="라벨 수정"
                            >
                              ✏️
                            </button>
                          </td>
                          <td>
                            {d.owner_id ? (
                              <div className="adm-user-cell">
                                <span className="adm-user-name">
                                  {owner?.nickname || '닉네임 없음'}
                                </span>
                                <span className="adm-user-id">{d.owner_id}</span>
                              </div>
                            ) : (
                              <span className="adm-status-tag inactive">미할당</span>
                            )}
                          </td>
                          <td>
                            <span className={`adm-status-tag ${d.registered ? 'active' : 'inactive'}`}>
                              {d.registered ? '등록 완료' : '미등록'}
                            </span>
                          </td>
                          <td>
                            <span className="adm-code" style={{ fontSize: 10, color: '#94a3b8' }}>
                              {d.device_secret?.slice(0, 8)}...
                            </span>
                          </td>
                          <td>{formatTime(d.last_seen_at)}</td>
                          <td>{formatTime(d.created_at)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {d.owner_id ? (
                                <button
                                  className="adm-btn danger sm"
                                  onClick={() => handleUnassignDevice(d)}
                                  title="현재 소유자 연결을 해제하고 미등록 상태로 전환합니다"
                                >
                                  유저 할당 해제
                                </button>
                              ) : (
                                <button
                                  className="adm-btn success sm"
                                  onClick={() => setModal({ type: 'assign_device', data: d })}
                                >
                                  유저 할당
                                </button>
                              )}
                              <button
                                className="adm-btn ghost sm"
                                onClick={() => setModal({ type: 'assign_device', data: d })}
                                title="다른 유저로 변경"
                              >
                                변경
                              </button>
                              <button
                                className="adm-btn primary sm"
                                onClick={() => setModal({ type: 'flash_device', data: d })}
                                title="이 기기 코드를 심은 펌웨어를 만들어 USB 로 굽습니다"
                              >
                                ⚡ 펌웨어 굽기
                              </button>
                              <button
                                className="adm-btn danger sm"
                                onClick={() => handleDeleteDevice(d)}
                                title="기기 삭제"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PROFILES & GAME STATES */}
        {tab === 'profiles' && (
          <div>
            <div className="adm-controls">
              <div className="adm-search-box">
                <input
                  type="text"
                  className="adm-input"
                  placeholder="닉네임, 슬러그, User ID 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>닉네임 / Slug</th>
                    <th>User ID</th>
                    <th>보유 기기</th>
                    <th>레벨 (Lv)</th>
                    <th>총 클릭수</th>
                    <th>코인</th>
                    <th>배고픔 (Hunger)</th>
                    <th>가입일</th>
                    <th>관리 액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="adm-empty">
                        조회된 유저가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredProfiles.map((p) => {
                      const gs = gameStateMap.get(p.id);
                      const userDevs = devicesByOwner.get(p.id) || [];
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="adm-user-cell">
                              <span className="adm-user-name">{p.nickname || '(이름 없음)'}</span>
                              {p.slug && <span className="adm-code" style={{ width: 'fit-content' }}>@{p.slug}</span>}
                            </div>
                          </td>
                          <td>
                            <span className="adm-user-id">{p.id}</span>
                          </td>
                          <td>
                            {userDevs.length > 0 ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {userDevs.map((d) => (
                                  <span key={d.id} className="adm-code">
                                    {d.device_code}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: '#64748b' }}>기기 없음</span>
                            )}
                          </td>
                          <td>
                            <b>Lv.{gs?.level ?? 1}</b>
                            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                              ({gs?.exp ?? 0} EXP)
                            </span>
                          </td>
                          <td>{(gs?.total_clicks ?? 0).toLocaleString()}</td>
                          <td>{(gs?.coins ?? 0).toLocaleString()} 🪙</td>
                          <td>{gs?.hunger ?? 0}%</td>
                          <td>{formatTime(p.created_at)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="adm-btn ghost sm"
                                onClick={() => setModal({ type: 'edit_profile', data: p })}
                              >
                                프로필 수정
                              </button>
                              <button
                                className="adm-btn ghost sm"
                                onClick={() => setModal({ type: 'edit_game_state', data: { profile: p, gs } })}
                              >
                                게임상태 수정
                              </button>
                              <button
                                className="adm-btn danger sm"
                                onClick={() => handleDeleteProfile(p)}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: FRIENDSHIPS */}
        {tab === 'friendships' && (
          <div>
            <div className="adm-controls">
              <div className="adm-search-box">
                <input
                  type="text"
                  className="adm-input"
                  placeholder="요청자/수신자 닉네임, ID 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  className="adm-select"
                  value={friendFilter}
                  onChange={(e) => setFriendFilter(e.target.value)}
                >
                  <option value="all">전체 상태</option>
                  <option value="accepted">수락됨 (Accepted)</option>
                  <option value="pending">대기중 (Pending)</option>
                  <option value="blocked">차단됨 (Blocked)</option>
                </select>
              </div>
              <div>
                <button
                  className="adm-btn primary"
                  onClick={() => setModal({ type: 'create_friendship' })}
                >
                  ➕ 친구 관계 수동 생성
                </button>
              </div>
            </div>

            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>요청자 (Requester)</th>
                    <th>수신자 (Addressee)</th>
                    <th>상태 (Status)</th>
                    <th>생성일</th>
                    <th>관리 액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFriendships.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="adm-empty">
                        조회된 친구 관계가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredFriendships.map((f) => {
                      const req = profileMap.get(f.requester_id);
                      const add = profileMap.get(f.addressee_id);
                      return (
                        <tr key={f.id}>
                          <td>
                            <div className="adm-user-cell">
                              <span className="adm-user-name">{req?.nickname || '알 수 없음'}</span>
                              <span className="adm-user-id">{f.requester_id}</span>
                            </div>
                          </td>
                          <td>
                            <div className="adm-user-cell">
                              <span className="adm-user-name">{add?.nickname || '알 수 없음'}</span>
                              <span className="adm-user-id">{f.addressee_id}</span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`adm-status-tag ${
                                f.status === 'accepted'
                                  ? 'active'
                                  : f.status === 'pending'
                                  ? 'pending'
                                  : 'blocked'
                              }`}
                            >
                              {f.status}
                            </span>
                          </td>
                          <td>{formatTime(f.created_at)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {f.status !== 'accepted' && (
                                <button
                                  className="adm-btn success sm"
                                  onClick={() => handleUpdateFriendStatus(f.id, 'accepted')}
                                >
                                  수락 처리
                                </button>
                              )}
                              {f.status !== 'pending' && (
                                <button
                                  className="adm-btn ghost sm"
                                  onClick={() => handleUpdateFriendStatus(f.id, 'pending')}
                                >
                                  대기 전환
                                </button>
                              )}
                              {f.status !== 'blocked' && (
                                <button
                                  className="adm-btn danger sm"
                                  onClick={() => handleUpdateFriendStatus(f.id, 'blocked')}
                                >
                                  차단 처리
                                </button>
                              )}
                              <button
                                className="adm-btn danger sm"
                                onClick={() => handleDeleteFriendship(f)}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: POKES */}
        {tab === 'pokes' && (
          <div>
            <div className="adm-controls">
              <div className="adm-search-box">
                <input
                  type="text"
                  className="adm-input"
                  placeholder="송신/수신 닉네임, User ID 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  className="adm-select"
                  value={pokeFilter}
                  onChange={(e) => setPokeFilter(e.target.value)}
                >
                  <option value="all">전체 상태</option>
                  <option value="pending">대기 중 (미소비)</option>
                  <option value="consumed">소비 완료 (Consumed)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {stats.pendingPokes > 0 && (
                  <button className="adm-btn danger" onClick={handleClearAllPendingPokes}>
                    🧹 대기 중 Poke 일괄 소비 완료
                  </button>
                )}
                <button
                  className="adm-btn primary"
                  onClick={() => setModal({ type: 'send_poke' })}
                >
                  👉 Poke 발송 테스트
                </button>
              </div>
            </div>

            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>보낸 사람 (From)</th>
                    <th>받는 사람 (To)</th>
                    <th>생성 일시</th>
                    <th>소비 일시 (Consumed At)</th>
                    <th>상태</th>
                    <th>관리 액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPokes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="adm-empty">
                        조회된 Poke가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredPokes.map((p) => {
                      const fromUser = profileMap.get(p.from_user);
                      const toUser = profileMap.get(p.to_user);
                      const isPending = !p.consumed_at;
                      return (
                        <tr key={p.id}>
                          <td>
                            <span className="adm-code">#{p.id}</span>
                          </td>
                          <td>
                            <div className="adm-user-cell">
                              <span className="adm-user-name">{fromUser?.nickname || '알 수 없음'}</span>
                              <span className="adm-user-id">{p.from_user}</span>
                            </div>
                          </td>
                          <td>
                            <div className="adm-user-cell">
                              <span className="adm-user-name">{toUser?.nickname || '알 수 없음'}</span>
                              <span className="adm-user-id">{p.to_user}</span>
                            </div>
                          </td>
                          <td>{formatTime(p.created_at)}</td>
                          <td>{formatTime(p.consumed_at)}</td>
                          <td>
                            <span className={`adm-status-tag ${isPending ? 'pending' : 'active'}`}>
                              {isPending ? '대기 중 (미수신)' : '표시 완료'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className={`adm-btn sm ${isPending ? 'success' : 'ghost'}`}
                                onClick={() => handleTogglePokeConsumed(p)}
                              >
                                {isPending ? '소비 완료 처리' : '대기로 복구'}
                              </button>
                              <button
                                className="adm-btn danger sm"
                                onClick={() => handleDeletePoke(p.id)}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------- */}
      {/* MODALS */}
      {/* ------------------------------------------------------------- */}

      {/* Modal: Create Device */}
      {modal?.type === 'create_device' && (
        <CreateDeviceModal
          onClose={() => setModal(null)}
          onSubmit={(code, label) => handleCreateDevice(code, label)}
        />
      )}

      {/* Modal: Edit Device Label */}
      {modal?.type === 'edit_device_label' && (
        <EditLabelModal
          device={modal.data}
          onClose={() => setModal(null)}
          onSubmit={(label) => handleEditDeviceLabel(modal.data.id, label)}
        />
      )}

      {/* Modal: Assign Device Owner */}
      {modal?.type === 'assign_device' && (
        <AssignDeviceModal
          device={modal.data}
          profiles={profiles}
          onClose={() => setModal(null)}
          onSubmit={(newOwnerId) => handleAssignDevice(modal.data.id, newOwnerId)}
        />
      )}

      {/* Modal: Edit Profile */}
      {modal?.type === 'edit_profile' && (
        <EditProfileModal
          profile={modal.data}
          onClose={() => setModal(null)}
          onSubmit={(nickname, slug) => handleUpdateProfile(modal.data.id, nickname, slug)}
        />
      )}

      {/* Modal: Edit Game State */}
      {modal?.type === 'edit_game_state' && (
        <EditGameStateModal
          profile={modal.data.profile}
          gameState={modal.data.gs}
          onClose={() => setModal(null)}
          onSubmit={(vals) => handleUpdateGameState(modal.data.profile.id, vals)}
        />
      )}

      {/* Modal: Create Friendship */}
      {modal?.type === 'create_friendship' && (
        <CreateFriendshipModal
          profiles={profiles}
          onClose={() => setModal(null)}
          onSubmit={(rId, aId, st) => handleCreateFriendship(rId, aId, st)}
        />
      )}

      {/* Modal: Flash Firmware */}
      {modal?.type === 'flash_device' && (
        <FlashDeviceModal device={modal.data} onClose={() => setModal(null)} />
      )}

      {/* Modal: Send Poke */}
      {modal?.type === 'send_poke' && (
        <SendPokeModal
          profiles={profiles}
          onClose={() => setModal(null)}
          onSubmit={(fromId, toId) => handleSendTestPoke(fromId, toId)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Sub-Modal Components
// -------------------------------------------------------------

function CreateDeviceModal({ onClose, onSubmit }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-title">신규 기기(Device) 등록</div>
        <div className="adm-modal-body">
          <div className="adm-form-group">
            <label className="adm-form-label">기기 코드 (Device Code, 예: DSJA-JD49-ABCD)</label>
            <input
              type="text"
              className="adm-input"
              placeholder="DSJA-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </div>
          <div className="adm-form-group">
            <label className="adm-form-label">라벨 / 메모 (선택)</label>
            <input
              type="text"
              className="adm-input"
              placeholder="예: 마크 거실 클리커"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn ghost" onClick={onClose}>취소</button>
          <button
            className="adm-btn primary"
            disabled={!code.trim()}
            onClick={() => onSubmit(code, label)}
          >
            기기 등록
          </button>
        </div>
      </div>
    </div>
  );
}

function EditLabelModal({ device, onClose, onSubmit }) {
  const [label, setLabel] = useState(device.label || '');

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-title">기기 라벨 수정</div>
        <div className="adm-modal-body">
          <p>기기 코드: <code className="adm-code">{device.device_code}</code></p>
          <div className="adm-form-group">
            <label className="adm-form-label">새 라벨</label>
            <input
              type="text"
              className="adm-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn ghost" onClick={onClose}>취소</button>
          <button className="adm-btn primary" onClick={() => onSubmit(label)}>저장</button>
        </div>
      </div>
    </div>
  );
}

function AssignDeviceModal({ device, profiles, onClose, onSubmit }) {
  const [selectedOwner, setSelectedOwner] = useState(device.owner_id || '');

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-title">기기 소유자 할당 / 변경</div>
        <div className="adm-modal-body">
          <p>기기 코드: <code className="adm-code">{device.device_code}</code></p>
          <div className="adm-form-group">
            <label className="adm-form-label">소유할 유저 선택</label>
            <select
              className="adm-select"
              style={{ width: '100%' }}
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
            >
              <option value="">-- 미할당 (소유자 없음) --</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname || '(이름없음)'} ({p.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn ghost" onClick={onClose}>취소</button>
          <button className="adm-btn primary" onClick={() => onSubmit(selectedOwner)}>할당 적용</button>
        </div>
      </div>
    </div>
  );
}

function EditProfileModal({ profile, onClose, onSubmit }) {
  const [nickname, setNickname] = useState(profile.nickname || '');
  const [slug, setSlug] = useState(profile.slug || '');

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-title">유저 프로필 수정</div>
        <div className="adm-modal-body">
          <div className="adm-form-group">
            <label className="adm-form-label">User ID (고유 식별자)</label>
            <input type="text" className="adm-input" value={profile.id} disabled />
          </div>
          <div className="adm-form-group">
            <label className="adm-form-label">닉네임</label>
            <input
              type="text"
              className="adm-input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className="adm-form-group">
            <label className="adm-form-label">Slug (초대용 @슬러그)</label>
            <input
              type="text"
              className="adm-input"
              placeholder="예: mark, dimsum-master"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn ghost" onClick={onClose}>취소</button>
          <button className="adm-btn primary" onClick={() => onSubmit(nickname, slug)}>저장</button>
        </div>
      </div>
    </div>
  );
}

function EditGameStateModal({ profile, gameState, onClose, onSubmit }) {
  const [level, setLevel] = useState(gameState?.level ?? 1);
  const [exp, setExp] = useState(gameState?.exp ?? 0);
  const [totalClicks, setTotalClicks] = useState(gameState?.total_clicks ?? 0);
  const [coins, setCoins] = useState(gameState?.coins ?? 0);
  const [hunger, setHunger] = useState(gameState?.hunger ?? 0);

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-title">유저 게임 상태 수정</div>
        <div className="adm-modal-body">
          <p>유저: <b>{profile.nickname || profile.id}</b></p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="adm-form-group">
              <label className="adm-form-label">레벨 (Level)</label>
              <input
                type="number"
                className="adm-input"
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="adm-form-group">
              <label className="adm-form-label">경험치 (EXP)</label>
              <input
                type="number"
                className="adm-input"
                value={exp}
                onChange={(e) => setExp(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="adm-form-group">
              <label className="adm-form-label">총 클릭 수 (Total Clicks)</label>
              <input
                type="number"
                className="adm-input"
                value={totalClicks}
                onChange={(e) => setTotalClicks(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="adm-form-group">
              <label className="adm-form-label">코인 (Coins)</label>
              <input
                type="number"
                className="adm-input"
                value={coins}
                onChange={(e) => setCoins(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="adm-form-group">
              <label className="adm-form-label">배고픔 (Hunger %)</label>
              <input
                type="number"
                className="adm-input"
                value={hunger}
                onChange={(e) => setHunger(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn ghost" onClick={onClose}>취소</button>
          <button
            className="adm-btn primary"
            onClick={() => onSubmit({ level, exp, total_clicks: totalClicks, coins, hunger })}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateFriendshipModal({ profiles, onClose, onSubmit }) {
  const [reqId, setReqId] = useState(profiles[0]?.id || '');
  const [addId, setAddId] = useState(profiles[1]?.id || '');
  const [status, setStatus] = useState('accepted');

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-title">친구 관계 수동 생성</div>
        <div className="adm-modal-body">
          <div className="adm-form-group">
            <label className="adm-form-label">요청자 (Requester)</label>
            <select
              className="adm-select"
              style={{ width: '100%' }}
              value={reqId}
              onChange={(e) => setReqId(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname || '(이름없음)'} ({p.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>
          <div className="adm-form-group">
            <label className="adm-form-label">수신자 (Addressee)</label>
            <select
              className="adm-select"
              style={{ width: '100%' }}
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname || '(이름없음)'} ({p.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>
          <div className="adm-form-group">
            <label className="adm-form-label">관계 상태</label>
            <select
              className="adm-select"
              style={{ width: '100%' }}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="accepted">수락 완료 (Accepted)</option>
              <option value="pending">대기 중 (Pending)</option>
              <option value="blocked">차단됨 (Blocked)</option>
            </select>
          </div>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn ghost" onClick={onClose}>취소</button>
          <button className="adm-btn primary" onClick={() => onSubmit(reqId, addId, status)}>
            생성
          </button>
        </div>
      </div>
    </div>
  );
}

function SendPokeModal({ profiles, onClose, onSubmit }) {
  const [fromId, setFromId] = useState(profiles[0]?.id || '');
  const [toId, setToId] = useState(profiles[1]?.id || '');

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-title">테스트 Poke 발송</div>
        <div className="adm-modal-body">
          <div className="adm-form-group">
            <label className="adm-form-label">보내는 사람 (From)</label>
            <select
              className="adm-select"
              style={{ width: '100%' }}
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname || '(이름없음)'} ({p.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>
          <div className="adm-form-group">
            <label className="adm-form-label">받는 사람 (To)</label>
            <select
              className="adm-select"
              style={{ width: '100%' }}
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname || '(이름없음)'} ({p.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn ghost" onClick={onClose}>취소</button>
          <button className="adm-btn primary" onClick={() => onSubmit(fromId, toId)}>
            👉 Poke 발송
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 펌웨어 굽기: 기기 코드/비밀키를 bin 에 심어 브라우저에서 바로 USB 플래시
// -------------------------------------------------------------

function FlashDeviceModal({ device, onClose }) {
  const [state, setState] = useState({ status: 'building' });
  const buttonRef = useRef(null);
  const supported = webFlashSupported();

  useEffect(() => {
    let cancelled = false;
    let revoke = null;

    (async () => {
      try {
        // esp-web-tools 는 300KB 가 넘는다 — 모달을 열 때만 가져온다.
        await import('esp-web-tools/dist/web/install-button.js');
        const built = await buildDeviceManifest(device.device_code, device.device_secret);
        revoke = built.revoke;
        if (cancelled) {
          built.revoke();
          return;
        }
        setState({ status: 'ready', ...built });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message || String(err) });
      }
    })();

    return () => {
      cancelled = true;
      if (!revoke) return;
      // 설치 대화상자는 body 에 따로 붙어 살아남는다 — 굽는 중에 이 모달을 닫아도
      // blob 이 사라지면 안 되므로, 대화상자가 닫힐 때까지 회수를 미룬다.
      const dialog = document.querySelector('ewt-install-dialog');
      if (dialog) dialog.addEventListener('closed', revoke, { once: true });
      else revoke();
    };
  }, [device.device_code, device.device_secret]);

  // 커스텀 엘리먼트라 manifest 는 속성이 아니라 프로퍼티로 넘겨야 blob URL 이 그대로 전달된다.
  useEffect(() => {
    if (buttonRef.current && state.manifestUrl) buttonRef.current.manifest = state.manifestUrl;
  }, [state.manifestUrl]);

  const downloadBin = () => {
    const url = URL.createObjectURL(state.firmwareBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firmware-${device.device_code}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-title">⚡ 펌웨어 굽기</div>
        <div className="adm-modal-body">
          <p>
            기기 코드: <code className="adm-code">{device.device_code}</code>
            {state.version && <span className="adm-flash-ver">펌웨어 v{state.version}</span>}
          </p>
          <p className="adm-flash-note">
            이 기기 코드를 심은 펌웨어를 브라우저에서 만들어 USB 로 바로 굽습니다.
            재컴파일은 하지 않아요. 다 구우면 기기가 재부팅되고 BLE 로 앱을 기다립니다.
          </p>

          {state.status === 'building' && <p className="adm-flash-note">펌웨어 준비 중…</p>}

          {state.status === 'error' && (
            <div className="adm-flash-error">
              <b>준비 실패</b>
              <div>{state.message}</div>
            </div>
          )}

          {state.status === 'ready' && !supported && (
            <div className="adm-flash-error">
              이 브라우저에서는 웹 플래시를 쓸 수 없어요 (Chrome/Edge + HTTPS 또는 localhost 필요).
              아래에서 bin 을 내려받아 esptool 로 구우세요.
            </div>
          )}

          {state.status === 'ready' && (
            <div className="adm-flash-actions">
              {supported && (
                <esp-web-install-button ref={buttonRef}>
                  <button className="adm-btn primary" slot="activate">
                    USB 연결하고 굽기
                  </button>
                  <span slot="unsupported" />
                  <span slot="not-allowed" />
                </esp-web-install-button>
              )}
              <button className="adm-btn ghost" onClick={downloadBin}>
                bin 내려받기
              </button>
            </div>
          )}

          <details className="adm-flash-cli">
            <summary>터미널에서 굽기 (여러 대 찍어낼 때)</summary>
            <pre>{`python3 tools/flash_device.py --code ${device.device_code}`}</pre>
          </details>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
