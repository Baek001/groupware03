import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messengerAPI } from '../../services/api';
import { uploadWorkspaceFiles, downloadWorkspaceFile } from '../../services/supabaseStorage';
import { useAuth } from '../../contexts/AuthContext';

function formatTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function MessengerPage() {
    const { currentTenant, user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const roomParam = searchParams.get('room') || '';
    const [users, setUsers] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [selectedRoomId, setSelectedRoomId] = useState(roomParam);
    const [roomDetail, setRoomDetail] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [error, setError] = useState('');
    const [messageText, setMessageText] = useState('');
    const [messageFiles, setMessageFiles] = useState([]);
    const [sending, setSending] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [groupMembers, setGroupMembers] = useState([]);
    const messagesEndRef = useRef(null);

    const selectedRoom = useMemo(
        () => rooms.find((room) => room.msgrId === selectedRoomId) || roomDetail?.room || null,
        [roomDetail?.room, rooms, selectedRoomId]
    );

    const loadRooms = useCallback(async () => {
        const [usersResponse, roomsResponse] = await Promise.all([
            messengerAPI.users().catch(() => ({ data: [] })),
            messengerAPI.rooms().catch(() => ({ data: [] })),
        ]);
        setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);
        const nextRooms = Array.isArray(roomsResponse.data) ? roomsResponse.data : [];
        setRooms(nextRooms);
        if (!selectedRoomId && nextRooms[0]?.msgrId) {
            setSelectedRoomId(nextRooms[0].msgrId);
        }
    }, [selectedRoomId]);

    const loadRoomConversation = useCallback(async (roomId) => {
        if (!roomId) {
            setRoomDetail(null);
            setMessages([]);
            return;
        }

        setMessagesLoading(true);
        try {
            const [detailResponse, messageResponse] = await Promise.all([
                messengerAPI.roomDetail(roomId),
                messengerAPI.messages(roomId, { limit: 50 }),
                messengerAPI.markAsRead(roomId).catch(() => ({ data: { ok: true } })),
            ]);
            setRoomDetail(detailResponse.data);
            setMessages(Array.isArray(messageResponse.data?.items) ? messageResponse.data.items : []);
            setError('');
        } catch (requestError) {
            setError(requestError.response?.data?.message || '채팅방을 불러오지 못했습니다.');
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    useEffect(() => {
        setSelectedRoomId(roomParam || '');
    }, [roomParam]);

    useEffect(() => {
        let active = true;
        async function initialize() {
            setLoading(true);
            try {
                await loadRooms();
            } catch (requestError) {
                if (active) {
                    setError(requestError.response?.data?.message || '메신저 정보를 불러오지 못했습니다.');
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }
        initialize();
        return () => {
            active = false;
        };
    }, [loadRooms]);

    useEffect(() => {
        if (!selectedRoomId) {
            return;
        }
        loadRoomConversation(selectedRoomId);
    }, [loadRoomConversation, selectedRoomId]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            loadRooms().catch(() => null);
            if (selectedRoomId) {
                loadRoomConversation(selectedRoomId).catch(() => null);
            }
        }, 2000);
        return () => window.clearInterval(timer);
    }, [loadRoomConversation, loadRooms, selectedRoomId]);

    useEffect(() => {
        if (!messagesEndRef.current) return;
        messagesEndRef.current.scrollIntoView({ block: 'end' });
    }, [messages]);

    function selectRoom(roomId) {
        setSelectedRoomId(roomId);
        const next = new URLSearchParams(searchParams);
        next.set('room', roomId);
        setSearchParams(next, { replace: true });
    }

    async function startDirectChat(targetUserId) {
        try {
            const response = await messengerAPI.findOrCreate(targetUserId);
            const roomId = response.data?.msgrId;
            if (roomId) {
                await loadRooms();
                selectRoom(roomId);
            }
        } catch (requestError) {
            setError(requestError.response?.data?.message || '1:1 대화를 시작하지 못했습니다.');
        }
    }

    async function createGroupRoom() {
        if (groupMembers.length === 0) {
            setError('그룹 채팅 참여자를 선택해 주세요.');
            return;
        }
        try {
            const response = await messengerAPI.createRoom({
                name: groupName,
                userIds: groupMembers,
            });
            const roomId = response.data?.msgrId;
            setGroupMembers([]);
            setGroupName('');
            await loadRooms();
            if (roomId) {
                selectRoom(roomId);
            }
        } catch (requestError) {
            setError(requestError.response?.data?.message || '그룹 채팅방을 만들지 못했습니다.');
        }
    }

    async function handleSendMessage(event) {
        event.preventDefault();
        if (!selectedRoomId || (!messageText.trim() && messageFiles.length === 0)) {
            return;
        }

        setSending(true);
        try {
            let fileIds = [];
            const messageId = crypto.randomUUID();
            if (messageFiles.length > 0 && currentTenant?.tenantId) {
                const uploaded = await uploadWorkspaceFiles({
                    workspaceId: currentTenant.tenantId,
                    ownerType: 'CHAT_MESSAGE',
                    ownerId: messageId,
                    files: messageFiles,
                });
                fileIds = uploaded.map((file) => file.fileId);
            }

            await messengerAPI.sendMessage(selectedRoomId, {
                messageId,
                contents: messageText,
                fileIds,
            });
            setMessageText('');
            setMessageFiles([]);
            await Promise.all([loadRooms(), loadRoomConversation(selectedRoomId)]);
        } catch (requestError) {
            setError(requestError.response?.data?.message || requestError.message || '메시지를 전송하지 못했습니다.');
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="page-shell" style={{ display: 'grid', gap: '20px' }}>
            <section className="card" style={{ padding: '24px' }}>
                <span className="badge badge-blue">MESSENGER</span>
                <h2 style={{ marginTop: '12px' }}>실시간 메신저</h2>
                <p style={{ marginTop: '8px', color: 'var(--gray-600)' }}>1:1, 그룹 채팅, 읽음 상태, 첨부파일을 Cloudflare + Supabase 구조로 처리합니다.</p>
                {error && <div className="alert alert-error" style={{ marginTop: '16px' }}>{error}</div>}
            </section>

            <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: '280px 320px minmax(0, 1fr)' }}>
                <section className="card" style={{ padding: '20px', display: 'grid', gap: '16px', alignContent: 'start' }}>
                    <div>
                        <h3>동료 목록</h3>
                        <p style={{ color: 'var(--gray-500)', fontSize: '13px' }}>클릭하면 바로 1:1 대화를 시작합니다.</p>
                    </div>
                    <div style={{ display: 'grid', gap: '10px', maxHeight: '520px', overflowY: 'auto' }}>
                        {loading ? <div className="feed-empty">불러오는 중...</div> : users.map((member) => (
                            <button key={member.userId} type="button" className="feed-user-card" onClick={() => startDirectChat(member.userId)}>
                                <div>
                                    <strong>{member.userNm}</strong>
                                    <small>{[member.deptNm, member.jbgdNm].filter(Boolean).join(' · ') || member.userEmail}</small>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gap: '10px', borderTop: '1px solid var(--gray-200)', paddingTop: '16px' }}>
                        <h4>그룹 채팅 만들기</h4>
                        <input className="form-input" type="text" placeholder="방 이름(선택)" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
                        <div style={{ display: 'grid', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                            {users.map((member) => (
                                <label key={`group-${member.userId}`} className="feed-checkbox feed-checkbox-card">
                                    <input type="checkbox" checked={groupMembers.includes(member.userId)} onChange={(event) => setGroupMembers((current) => event.target.checked ? [...current, member.userId] : current.filter((id) => id !== member.userId))} />
                                    {member.userNm}
                                </label>
                            ))}
                        </div>
                        <button type="button" className="btn btn-primary" onClick={createGroupRoom}>그룹 방 만들기</button>
                    </div>
                </section>

                <section className="card" style={{ padding: '20px', display: 'grid', gap: '12px', alignContent: 'start' }}>
                    <div>
                        <h3>대화방</h3>
                        <p style={{ color: 'var(--gray-500)', fontSize: '13px' }}>2초 간격으로 최신 상태를 확인합니다.</p>
                    </div>
                    <div style={{ display: 'grid', gap: '10px', maxHeight: '640px', overflowY: 'auto' }}>
                        {rooms.length === 0 ? <div className="feed-empty">아직 대화방이 없습니다.</div> : rooms.map((room) => (
                            <button key={room.msgrId} type="button" className={`feed-widget-item ${selectedRoomId === room.msgrId ? 'active' : ''}`} onClick={() => selectRoom(room.msgrId)}>
                                <div className="feed-widget-item-main">
                                    <strong>{room.msgrNm}</strong>
                                    <span>{room.lastMessagePreview || '대화를 시작해 보세요.'}</span>
                                </div>
                                <div className="feed-widget-item-meta">
                                    {room.unreadCount > 0 && <span className="badge badge-green">{room.unreadCount}</span>}
                                    <small>{formatTime(room.lastMessageAt)}</small>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="card" style={{ padding: '20px', display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: '700px' }}>
                    <div style={{ borderBottom: '1px solid var(--gray-200)', paddingBottom: '16px' }}>
                        <h3>{selectedRoom?.msgrNm || '대화방을 선택해 주세요'}</h3>
                        <p style={{ color: 'var(--gray-500)', fontSize: '13px' }}>
                            {selectedRoom ? `${selectedRoom.participantCount}명 · ${selectedRoom.roomType}` : '왼쪽 목록에서 대화방을 선택하세요.'}
                        </p>
                    </div>

                    <div style={{ padding: '16px 0', overflowY: 'auto', display: 'grid', gap: '12px' }}>
                        {messagesLoading ? <div className="feed-empty">메시지를 불러오는 중...</div> : !selectedRoomId ? <div className="feed-empty">대화방을 선택해 주세요.</div> : messages.length === 0 ? <div className="feed-empty">첫 메시지를 보내보세요.</div> : messages.map((message) => (
                            <div key={message.msgContId} style={{ display: 'grid', justifyItems: message.mine ? 'end' : 'start' }}>
                                <div className="card" style={{ padding: '12px 14px', maxWidth: '80%', background: message.mine ? 'var(--primary-50)' : 'var(--gray-50)' }}>
                                    <strong style={{ fontSize: '13px' }}>{message.senderUserNm}</strong>
                                    {message.contents && <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{message.contents}</p>}
                                    {(message.files || []).length > 0 && (
                                        <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                                            {message.files.map((file) => (
                                                <button key={file.fileId} type="button" className="feed-inline-item" onClick={() => downloadWorkspaceFile(file)}>
                                                    <div>
                                                        <strong>{file.originalName}</strong>
                                                        <small>{Math.round((file.sizeBytes || 0) / 1024)} KB</small>
                                                    </div>
                                                    <span className="badge badge-gray">다운로드</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--gray-500)' }}>{formatTime(message.sendDt)} · 읽음 {message.readCount}</div>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSendMessage} style={{ display: 'grid', gap: '10px', borderTop: '1px solid var(--gray-200)', paddingTop: '16px' }}>
                        <textarea className="form-input" rows="4" placeholder={selectedRoomId ? `${user?.userNm || '나'}님의 메시지` : '대화방을 먼저 선택해 주세요.'} value={messageText} onChange={(event) => setMessageText(event.target.value)} disabled={!selectedRoomId || sending} />
                        <input className="form-input" type="file" multiple onChange={(event) => setMessageFiles(Array.from(event.target.files || []))} disabled={!selectedRoomId || sending} />
                        {messageFiles.length > 0 && <small>{messageFiles.map((file) => file.name).join(', ')}</small>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={!selectedRoomId || sending}>{sending ? '전송 중...' : '보내기'}</button>
                        </div>
                    </form>
                </section>
            </div>
        </div>
    );
}
