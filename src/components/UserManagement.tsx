import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Edit3, 
  Search, 
  UserCheck, 
  X, 
  AlertTriangle,
  Mail,
  User,
  Heart,
  Save,
  ShieldAlert,
  Check,
  Clock,
  LogIn
} from 'lucide-react';
import { UserAccount, UserRole } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';

interface UserManagementProps {
  currentUserEmail: string | null;
  isAdmin: boolean;
}

export default function UserManagement({ currentUserEmail, isAdmin }: UserManagementProps) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form states (Add/Edit)
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{
    isOpen: boolean;
    userId: string;
    displayName: string;
    nickname: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      let qSnap;
      try {
        qSnap = await getDocs(collection(db, 'users'));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'users');
        return;
      }
      const list: UserAccount[] = [];
      qSnap.forEach(d => {
        const data = d.data() as UserAccount;
        list.push({
          ...data,
          id: data.id || d.id
        });
      });
      // Sort: admins first, then displayName
      list.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        return a.displayName.localeCompare(b.displayName);
      });
      setUsers(list);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setEmail('');
    setDisplayName('');
    setNickname('');
    setRole('employee');
    setIsEditing(false);
    setEditingUserId(null);
    setFormError('');
    setFormSuccess('');
  };

  const handleEditClick = (u: UserAccount) => {
    if (!isAdmin) return;
    setIsEditing(true);
    setEditingUserId(u.id);
    setEmail(u.email);
    setDisplayName(u.displayName);
    setNickname(u.nickname || '');
    setRole(u.role);
    setFormError('');
    setFormSuccess('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!email.trim() || !displayName.trim() || !nickname.trim()) {
      setFormError('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง');
      return;
    }

    if (!email.includes('@')) {
      setFormError('กรุณากรอกรูปแบบอีเมลให้ถูกต้อง');
      return;
    }

    try {
      if (isEditing && editingUserId) {
        // Edit flow
        const userDocRef = doc(db, 'users', editingUserId);
        try {
          await updateDoc(userDocRef, {
            email: email.trim(),
            displayName: displayName.trim(),
            nickname: nickname.trim(),
            role
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${editingUserId}`);
        }
        
        setFormSuccess('อัปเดตข้อมูลพนักงานสำเร็จ!');
      } else {
        // Create flow
        // Check if email already exists
        const emailExists = users.some(u => u.email.toLowerCase() === email.trim().toLowerCase());
        if (emailExists) {
          setFormError('อีเมลนี้ถูกลงทะเบียนไว้ในระบบแล้ว');
          return;
        }

        const newDocRef = doc(collection(db, 'users'));
        const newAccount: UserAccount = {
          id: newDocRef.id,
          email: email.trim().toLowerCase(),
          displayName: displayName.trim(),
          nickname: nickname.trim(),
          role,
          createdAt: new Date().toISOString()
        };

        try {
          await setDoc(newDocRef, newAccount);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `users/${newDocRef.id}`);
        }
        setFormSuccess('เพิ่มรายชื่อพนักงานเข้าสู่ระบบสำเร็จ!');
      }

      clearForm();
      fetchUsers();
    } catch (err: any) {
      console.error('Save error:', err);
      setFormError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  const executeDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    const { userId } = deleteConfirmUser;
    setDeleteConfirmUser(null);
    setFormError('');
    setFormSuccess('');

    try {
      try {
        await deleteDoc(doc(db, 'users', userId));
        setFormSuccess('ลบรายชื่อพนักงานออกจากระบบสำเร็จ!');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
      }
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      setFormError('ไม่สามารถลบผู้ใช้ออกจากระบบได้');
    }
  };

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.nickname && u.nickname.toLowerCase().includes(term)) ||
      u.role.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6" id="user-management-root">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
          <Users className="h-5 w-5 text-indigo-600" />
          <span>การจัดการบัญชีผู้ใช้และพนักงาน</span>
        </h2>
        <p className="text-xs text-slate-500">เพิ่ม ลบ หรือแก้ไขข้อมูลพนักงานเพื่อดึงเข้ากิจกรรมประชุม กำหนดบทบาทพนักงานหรือแอดมิน</p>
      </div>

      {/* Global Notifications Alert Area */}
      {(formError || formSuccess) && (
        <div className="space-y-2 animate-in fade-in duration-200">
          {formError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>{formError}</span>
              </span>
              <button type="button" onClick={() => setFormError('')} className="text-rose-400 hover:text-rose-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {formSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{formSuccess}</span>
              </span>
              <button type="button" onClick={() => setFormSuccess('')} className="text-emerald-400 hover:text-emerald-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Grid: Accounts List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm">รายชื่อพนักงานทั้งหมด ({filteredUsers.length} คน)</h3>
            
            {/* Search Input */}
            <div className="relative">
              <input 
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ค้นหาพนักงาน/อีเมล/บทบาท..."
                className="w-full sm:w-[220px] text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-3">พนักงาน</th>
                  <th className="py-3 px-3">อีเมลติดต่อ</th>
                  <th className="py-3 px-3">สิทธิ์การใช้งาน</th>
                  <th className="py-3 px-3">เข้าสู่ระบบล่าสุด</th>
                  {isAdmin && <th className="py-3 px-3 text-right">เครื่องมือ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="text-center py-6 text-slate-400">กำลังดาวน์โหลดข้อมูลพนักงาน...</td>
                  </tr>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map(u => {
                    const isSelf = u.email === currentUserEmail;
                    const formattedLastLogin = u.lastLoginAt ? (() => {
                      try {
                        const d = new Date(u.lastLoginAt);
                        if (isNaN(d.getTime())) return 'ยังไม่เคยเข้าใช้';
                        return d.toLocaleString('th-TH', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) + ' น.';
                      } catch {
                        return 'ยังไม่เคยเข้าใช้';
                      }
                    })() : 'ยังไม่เคยเข้าใช้';

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="flex items-center space-x-2.5">
                            {u.photoURL ? (
                              <img 
                                src={u.photoURL} 
                                alt={u.displayName} 
                                className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[11px] shrink-0 border border-indigo-200/60">
                                {u.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-slate-800">{u.displayName}</div>
                              <div className="text-[10px] text-slate-400">
                                ชื่อเล่น: <strong className="text-indigo-600 font-bold bg-indigo-50 px-1 py-0.25 rounded">{u.nickname || '-'}</strong>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-mono text-slate-600 font-medium">{u.email}</div>
                          <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Google / Gmail Auth</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                            u.role === 'admin' 
                            ? 'bg-rose-50 text-rose-700 border-rose-100' 
                            : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                          }`}>
                            {u.role === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้ใช้งาน'}
                          </span>
                          {isSelf && (
                            <span className="ml-1.5 text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                              คุณเอง
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="text-slate-600 flex items-center gap-1 font-medium text-[11px]">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{formattedLastLogin}</span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleEditClick(u)}
                                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                                title="แก้ไขพนักงาน"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (isSelf) return;
                                  setDeleteConfirmUser({
                                    isOpen: true,
                                    userId: u.id,
                                    displayName: u.displayName,
                                    nickname: u.nickname || '',
                                    email: u.email
                                  });
                                }}
                                disabled={isSelf}
                                className={`p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer ${isSelf ? 'opacity-30 cursor-not-allowed' : ''}`}
                                title="ลบออกจากระบบ"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-slate-400">ไม่พบรายชื่อพนักงานที่ระบุ</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Grid: Create / Edit Form */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-1.5">
              {isEditing ? <Edit3 className="h-4 w-4 text-indigo-600" /> : <UserPlus className="h-4 w-4 text-indigo-600" />}
              <span>{isEditing ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานเข้าระบบ'}</span>
            </h3>
            {(isEditing || email || displayName || nickname) && (
              <button 
                onClick={clearForm}
                className="text-slate-400 hover:text-slate-600 text-xs flex items-center"
              >
                <X className="h-3 w-3 mr-0.5" />
                เคลียร์ฟอร์ม
              </button>
            )}
          </div>

          {!isAdmin ? (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center space-y-2 text-xs">
              <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto" />
              <div className="font-bold text-slate-700">สิทธิ์พนักงานจำกัด</div>
              <p className="text-slate-400">เฉพาะผู้ใช้งานระดับ ผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเพิ่ม ลบ หรือแก้ไขข้อมูลของพนักงานท่านอื่นได้</p>
            </div>
          ) : (
            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-2.5 rounded-lg font-bold">
                  ⚠️ {formError}
                </div>
              )}
              {formSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-2.5 rounded-lg font-bold">
                  ✓ {formSuccess}
                </div>
              )}

              {/* Display Name */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">ชื่อ - นามสกุล *</label>
                <div className="relative">
                  <input 
                    type="text"
                    required
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="เช่น นายสมบูรณ์ ดีเลิศ"
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <User className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Nickname */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">ชื่อเล่น *</label>
                <div className="relative">
                  <input 
                    type="text"
                    required
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder="เช่น บอย"
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <Heart className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">อีเมลติดต่อ (Gmail / Company Email) *</label>
                <div className="relative">
                  <input 
                    type="email"
                    required
                    disabled={isEditing} // Avoid changing primary identifier email directly
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="เช่น somboon.d@ec.co.th"
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  <Mail className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Role */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">กำหนดระดับสิทธิ์การใช้งาน *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('employee')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all ${
                      role === 'employee'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    ผู้ใช้งาน
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all ${
                      role === 'admin'
                      ? 'bg-rose-50 border-rose-500 text-rose-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    ผู้ดูแลระบบ (Admin)
                  </button>
                </div>
              </div>

              {/* Actions */}
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center space-x-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isEditing ? 'อัปเดตข้อมูลพนักงาน' : 'เพิ่มรายชื่อพนักงาน'}</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Custom Delete Employee Confirmation Modal */}
      {deleteConfirmUser && deleteConfirmUser.isOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl max-w-sm w-full space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-full">
                <Trash2 className="h-6 w-6 text-rose-500 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-slate-800">ยืนยันการลบพนักงาน</h3>
            </div>
            
            <div className="space-y-2 text-sm text-slate-600">
              <p className="font-medium text-slate-700 text-center py-2">
                คุณต้องการลบ <span className="text-rose-600 font-extrabold">{deleteConfirmUser.nickname || deleteConfirmUser.displayName}</span> ออกใช่หรือไม่
              </p>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                className="flex-1 py-2 px-4 border border-slate-200 text-slate-600 font-bold rounded-lg text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={executeDeleteUser}
                className="flex-1 py-2 px-4 bg-rose-600 text-white font-bold rounded-lg text-xs hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-200"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
