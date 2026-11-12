import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function App() {
  const COMPANY_NAME = "บริษัท รักษาความปลอดภัย เอ็นพีเอส เซฟตี้ จำกัด";
  const COMPANY_LOGO = "https://cdn-icons-png.flaticon.com/512/9309/9309259.png";

  const [currentView, setCurrentView] = useState('checkin');
  const [adminTab, setAdminTab] = useState('logs');

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const ADMIN_PASSCODE = "1234";

  // State สำหรับหน้าเช็คอินพนักงาน
  const [employeeCode, setEmployeeCode] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeUnit, setEmployeeUnit] = useState('');
  const [locations, setLocations] = useState([]);
  const [checkType, setCheckType] = useState('in');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [checkingName, setCheckingName] = useState(false);
  const [codeNotFound, setCodeNotFound] = useState(false);
  const lookupTimer = useRef(null);

  // State สำหรับหน้า Admin
  const [logs, setLogs] = useState([]);
  const [filterUnit, setFilterUnit] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  // State สำหรับจัดการพนักงาน
  const [employeesList, setEmployeesList] = useState([]);
  const [newEmpCode, setNewEmpCode] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpUnit, setNewEmpUnit] = useState('');
  const [empLoading, setEmpLoading] = useState(false);

  // State สำหรับจัดการพิกัด GPS (Locations)
  const [newLocName, setNewLocName] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [newRadius, setNewRadius] = useState('100');
  const [locLoading, setLocLoading] = useState(false);

  useEffect(() => {
    if (currentView === 'admin' && isAdminAuthenticated) {
      fetchLogs();
      fetchEmployees();
      fetchLocations();
    }
  }, [currentView, isAdminAuthenticated]);

  // เคลียร์ timer ตอนปิดหน้า
  useEffect(() => {
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, []);

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase.from('locations').select('*');
      if (error) throw error;
      setLocations(data || []);
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase.from('employees').select('*').order('id', { ascending: true });
      if (error) throw error;
      setEmployeesList(data || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPasswordInput === ADMIN_PASSCODE) {
      setIsAdminAuthenticated(true);
      setAdminPasswordInput('');
    } else {
      alert('❌ รหัสผ่านไม่ถูกต้อง');
      setAdminPasswordInput('');
    }
  };

  // ค้นหาพนักงานจากรหัส
  const lookupEmployee = async (rawCode) => {
    const code = rawCode.trim();

    if (code.length === 0) {
      setEmployeeName('');
      setEmployeeUnit('');
      setCodeNotFound(false);
      return;
    }

    setCheckingName(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('employee_name, unit')
        .eq('employee_code', code)
        .maybeSingle();

      if (error) {
        console.error('Supabase query error:', error);
        setEmployeeName('');
        setEmployeeUnit('');
        setCodeNotFound(false);
        return;
      }

      if (data) {
        setEmployeeName(data.employee_name || '');
        setEmployeeUnit(data.unit || '');
        setCodeNotFound(false);
      } else {
        setEmployeeName('');
        setEmployeeUnit('');
        setCodeNotFound(true);
      }
    } catch (err) {
      console.error('Catch error:', err);
      setEmployeeName('');
      setEmployeeUnit('');
      setCodeNotFound(false);
    } finally {
      setCheckingName(false);
    }
  };

  const handleEmployeeCodeChange = (e) => {
    const code = e.target.value;
    setEmployeeCode(code);
    setCodeNotFound(false);

    if (lookupTimer.current) clearTimeout(lookupTimer.current);

    if (code.trim().length === 0) {
      setEmployeeName('');
      setEmployeeUnit('');
      return;
    }

    // หน่วง 400ms หลังหยุดพิมพ์ ค่อยค้นหา (ไม่ยิงทุกตัวอักษร)
    lookupTimer.current = setTimeout(() => lookupEmployee(code), 400);
  };

  const handleEmployeeCodeBlur = () => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupEmployee(employeeCode);
  };

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!employeeCode || !employeeName) {
      setStatusMessage({ type: 'error', text: '⚠️ กรุณากรอกรหัสพนักงานที่ถูกต้อง' });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    if (!navigator.geolocation) {
      setStatusMessage({ type: 'error', text: '⚠️ เบราว์เซอร์ไม่รองรับ GPS' });
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const actionLabel = checkType === 'in' ? 'เข้างาน (Check-in)' : 'ออกงาน (Check-out)';

        try {
          // ไม่ส่ง created_at ให้ฐานข้อมูลตั้งเวลาเอง (default now())
          const { error } = await supabase.from('attendance_logs').insert([
            {
              employee_code: employeeCode.trim(),
              employee_name: employeeName,
              location_name: employeeUnit || '-',
              latitude: userLat,
              longitude: userLng,
              check_type: checkType
            }
          ]);

          if (error) throw error;

          setStatusMessage({ type: 'success', text: `✅ บันทึก${actionLabel}สำเร็จ!` });

          // เคลียร์ฟอร์มหลังบันทึกสำเร็จ
          setEmployeeCode('');
          setEmployeeName('');
          setEmployeeUnit('');
          setCodeNotFound(false);
        } catch (err) {
          console.error('Insert error:', err);
          setStatusMessage({ type: 'error', text: '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        } finally {
          setLoading(false);
        }
      },
      () => {
        setStatusMessage({ type: 'error', text: '❌ ไม่สามารถดึงพิกัด GPS ได้ (กรุณากดอนุญาตการเข้าถึงตำแหน่ง)' });
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmpCode || !newEmpName) {
      alert('⚠️ กรุณากรอกรหัสและชื่อพนักงาน');
      return;
    }

    setEmpLoading(true);
    try {
      const { error } = await supabase.from('employees').insert([
        {
          employee_code: newEmpCode.trim(),
          employee_name: newEmpName.trim(),
          unit: newEmpUnit.trim()
        }
      ]);

      if (error) throw error;
      alert('✅ เพิ่มพนักงานสำเร็จ!');
      setNewEmpCode('');
      setNewEmpName('');
      setNewEmpUnit('');
      fetchEmployees();
    } catch (err) {
      console.error('Add employee error:', err);
      alert('❌ เพิ่มพนักงานไม่สำเร็จ (รหัสอาจซ้ำ หรือไม่มีสิทธิ์เขียนข้อมูล)');
    } finally {
      setEmpLoading(false);
    }
  };

  const handleDeleteEmployee = async (empId) => {
    if (!window.confirm('คุณต้องการลบพนักงานคนนี้ออกจากระบบใช่หรือไม่?')) return;
    try {
      const { error } = await supabase.from('employees').delete().eq('id', empId);
      if (error) throw error;
      alert('🗑️ ลบพนักงานสำเร็จ');
      fetchEmployees();
    } catch (err) {
      alert('❌ ไม่สามารถลบพนักงานได้');
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocName || !newLat || !newLng) {
      alert('⚠️ กรุณากรอกชื่อหน่วยงาน ละติจูด และลองจิจูดให้ครบถ้วน');
      return;
    }

    setLocLoading(true);
    try {
      const { error } = await supabase.from('locations').insert([
        {
          name: newLocName.trim(),
          latitude: parseFloat(newLat),
          longitude: parseFloat(newLng),
          radius: parseInt(newRadius) || 100
        }
      ]);

      if (error) throw error;
      alert('✅ เพิ่มจุดตรวจ/พิกัด GPS สำเร็จ!');
      setNewLocName('');
      setNewLat('');
      setNewLng('');
      setNewRadius('100');
      fetchLocations();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาดในการบันทึกพิกัด');
    } finally {
      setLocLoading(false);
    }
  };

  const handleDeleteLocation = async (locId) => {
    if (!window.confirm('คุณต้องการลบจุดตรวจนี้ใช่หรือไม่?')) return;
    try {
      const { error } = await supabase.from('locations').delete().eq('id', locId);
      if (error) throw error;
      alert('🗑️ ลบจุดตรวจสำเร็จ');
      fetchLocations();
    } catch (err) {
      alert('❌ ไม่สามารถลบจุดตรวจได้');
    }
  };

  const handleGetCurrentGPS = () => {
    if (!navigator.geolocation) {
      alert('เบราว์เซอร์ไม่รองรับ GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewLat(position.coords.latitude.toFixed(6));
        setNewLng(position.coords.longitude.toFixed(6));
        alert('📍 ดึงพิกัดปัจจุบันของคุณมาใส่ช่องละติจูด/ลองจิจูดเรียบร้อย!');
      },
      () => {
        alert('ไม่สามารถดึงตำแหน่ง GPS ได้');
      },
      { enableHighAccuracy: true }
    );
  };

  const exportToCSV = () => {
    if (filteredLogs.length === 0) {
      alert('⚠️ ไม่มีข้อมูลสำหรับส่งออกรายงาน');
      return;
    }

    let csvContent = '\uFEFF"ประเภทลงเวลา","เวลาที่บันทึก","รหัสพนักงาน","ชื่อ - นามสกุล","หน่วยงาน","ละติจูด","ลองจิจูด"\n';

    filteredLogs.forEach((log) => {
      const typeStr = log.check_type === 'out' ? 'ออกงาน' : 'เข้างาน';
      const timeStr = new Date(log.created_at).toLocaleString('th-TH');
      const codeStr = `"${log.employee_code}"`;
      const nameStr = `"${log.employee_name}"`;
      const unitStr = `"${log.location_name || ''}"`;
      const latStr = log.latitude ?? '';
      const lngStr = log.longitude ?? '';

      csvContent += `"${typeStr}","${timeStr}",${codeStr},${nameStr},${unitStr},${latStr},${lngStr}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NPS_Attendance_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // รายชื่อหน่วยงานสำหรับตัวกรอง (ดึงจากข้อมูลที่บันทึกจริง)
  const unitOptions = Array.from(
    new Set(logs.map((log) => log.location_name).filter(Boolean))
  ).sort();

  const filteredLogs = logs.filter((log) => {
    const matchUnit = filterUnit ? log.location_name === filterUnit : true;
    const matchSearch = searchTerm
      ? (log.employee_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.employee_code || '').toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchUnit && matchSearch;
  });

  return (
    <div style={styles.container}>
      <div style={styles.navBar}>
        <div style={styles.navBrand}>
          <img src={COMPANY_LOGO} alt="Logo" style={styles.navLogo} />
          <span style={styles.navTitleText}>{COMPANY_NAME}</span>
        </div>
        <div style={styles.navButtons}>
          <button
            onClick={() => setCurrentView('checkin')}
            style={{ ...styles.navBtn, ...(currentView === 'checkin' ? styles.navBtnActive : {}) }}
          >
            📍 ลงเวลา (รปภ.)
          </button>
          <button
            onClick={() => setCurrentView('admin')}
            style={{ ...styles.navBtn, ...(currentView === 'admin' ? styles.navBtnActive : {}) }}
          >
            📊 หลังบ้าน Admin
          </button>
        </div>
      </div>

      <div style={styles.contentArea}>
        {currentView === 'checkin' ? (
          <div style={styles.card}>
            <div style={styles.headerContainer}>
              <img src={COMPANY_LOGO} alt="Logo" style={styles.logo} />
              <span style={styles.companyName}>{COMPANY_NAME}</span>
            </div>

            <h1 style={styles.title}>🛡️ ระบบลงเวลา รปภ.</h1>
            <p style={styles.subtitle}>บันทึกเวลาเข้า-ออกงานและตำแหน่ง GPS</p>

            <div style={styles.modeToggle}>
              <button
                type="button"
                onClick={() => setCheckType('in')}
                style={{ ...styles.modeBtn, ...(checkType === 'in' ? styles.modeBtnInActive : {}) }}
              >
                📥 เข้างาน (Check-in)
              </button>
              <button
                type="button"
                onClick={() => setCheckType('out')}
                style={{ ...styles.modeBtn, ...(checkType === 'out' ? styles.modeBtnOutActive : {}) }}
              >
                📤 ออกงาน (Check-out)
              </button>
            </div>

            <form onSubmit={handleCheckIn} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>รหัสพนักงาน</label>
                <input
                  type="text"
                  required
                  value={employeeCode}
                  onChange={handleEmployeeCodeChange}
                  onBlur={handleEmployeeCodeBlur}
                  placeholder="กรอกรหัสพนักงาน..."
                  style={styles.input}
                />
                {codeNotFound && (
                  <span style={styles.errorText}>❌ ไม่พบรหัสพนักงานนี้ในระบบ</span>
                )}
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  ชื่อ - นามสกุล {checkingName && <span style={styles.loadingText}>(กำลังค้นหา...)</span>}
                </label>
                <input
                  type="text"
                  required
                  value={employeeName}
                  readOnly
                  placeholder="แสดงอัตโนมัติ..."
                  style={{ ...styles.input, backgroundColor: '#f9fafb' }}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>หน่วยงาน</label>
                <input
                  type="text"
                  value={employeeUnit}
                  readOnly
                  placeholder="แสดงอัตโนมัติ..."
                  style={{ ...styles.input, backgroundColor: '#f9fafb' }}
                />
              </div>

              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'กำลังดึงพิกัด GPS...' : checkType === 'in' ? '📍 ยืนยันเข้างาน' : '🏁 ยืนยันออกงาน'}
              </button>
            </form>

            {statusMessage && (
              <div
                style={{
                  ...styles.alert,
                  ...(statusMessage.type === 'success'
                    ? styles.alertSuccess
                    : statusMessage.type === 'warning'
                    ? styles.alertWarning
                    : styles.alertError),
                }}
              >
                {statusMessage.text}
              </div>
            )}
          </div>
        ) : !isAdminAuthenticated ? (
          <div style={styles.card}>
            <h2 style={styles.title}>🔒 เข้าสู่ระบบ Admin</h2>
            <p style={styles.subtitle}>กรุณากรอกรหัสผ่านเพื่อจัดการหลังบ้าน</p>
            <form onSubmit={handleAdminLogin} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>รหัสผ่าน</label>
                <input
                  type="password"
                  required
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="รหัสผ่าน..."
                  style={styles.input}
                />
              </div>
              <button type="submit" style={styles.button}>เข้าสู่ระบบ</button>
            </form>
          </div>
        ) : (
          <div style={styles.adminCard}>
            <div style={styles.adminHeader}>
              <div>
                <h2 style={styles.adminTitle}>📊 ระบบจัดการหลังบ้าน</h2>
                <p style={styles.adminSubtitle}>{COMPANY_NAME}</p>
              </div>
              <button
                onClick={() => setIsAdminAuthenticated(false)}
                style={{ ...styles.refreshBtn, backgroundColor: '#fee2e2', color: '#991b1b' }}
              >
                🚪 ออกจากระบบ
              </button>
            </div>

            <div style={styles.adminTabs}>
              <button
                onClick={() => setAdminTab('logs')}
                style={{ ...styles.adminTabBtn, ...(adminTab === 'logs' ? styles.adminTabActive : {}) }}
              >
                📋 ตรวจเช็ค เข้า-ออก งาน
              </button>
              <button
                onClick={() => setAdminTab('summary')}
                style={{ ...styles.adminTabBtn, ...(adminTab === 'summary' ? styles.adminTabActive : {}) }}
              >
                📈 สรุปรายเดือน
              </button>
              <button
                onClick={() => setAdminTab('employees')}
                style={{ ...styles.adminTabBtn, ...(adminTab === 'employees' ? styles.adminTabActive : {}) }}
              >
                👥 จัดการพนักงาน
              </button>
              <button
                onClick={() => setAdminTab('locations')}
                style={{ ...styles.adminTabBtn, ...(adminTab === 'locations' ? styles.adminTabActive : {}) }}
              >
                📍 จัดการพิกัด GPS จุดตรวจ
              </button>
            </div>

            {adminTab === 'logs' && (
              <div>
                <div style={styles.filterBar}>
                  <input
                    type="text"
                    placeholder="🔍 ค้นหาชื่อ หรือรหัสพนักงาน..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={styles.searchInput}
                  />
                  <select
                    value={filterUnit}
                    onChange={(e) => setFilterUnit(e.target.value)}
                    style={styles.filterSelect}
                  >
                    <option value="">-- ทุกหน่วยงาน --</option>
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                  <button onClick={fetchLogs} style={styles.refreshBtn}>🔄 รีเฟรช</button>
                  <button onClick={exportToCSV} style={{ ...styles.refreshBtn, backgroundColor: '#059669', color: '#ffffff' }}>
                    📥 ดาวน์โหลด Excel (CSV)
                  </button>
                </div>

                <div style={styles.tableContainer}>
                  {loadingLogs ? (
                    <p style={styles.loadingLogsText}>กำลังโหลดข้อมูล...</p>
                  ) : filteredLogs.length === 0 ? (
                    <p style={styles.loadingLogsText}>ไม่พบข้อมูล</p>
                  ) : (
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeaderRow}>
                          <th style={styles.th}>ประเภท</th>
                          <th style={styles.th}>เวลา</th>
                          <th style={styles.th}>รหัส</th>
                          <th style={styles.th}>ชื่อ - นามสกุล</th>
                          <th style={styles.th}>หน่วยงาน</th>
                          <th style={styles.th}>ตำแหน่ง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.map((log) => (
                          <tr key={log.id} style={styles.tableRow}>
                            <td style={styles.td}>
                              {log.check_type === 'out' ? (
                                <span style={{ color: '#d97706', fontWeight: 'bold' }}>📤 ออกงาน</span>
                              ) : (
                                <span style={{ color: '#059669', fontWeight: 'bold' }}>📥 เข้างาน</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              {new Date(log.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' })}
                            </td>
                            <td style={styles.td}><span style={styles.badgeCode}>{log.employee_code}</span></td>
                            <td style={{ ...styles.td, fontWeight: '600' }}>{log.employee_name}</td>
                            <td style={styles.td}>{log.location_name}</td>
                            <td style={styles.td}>
                              {log.latitude && log.longitude ? (
                                <a
                                  href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={styles.mapLink}
                                >
                                  🗺️ ดูแผนที่
                                </a>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {adminTab === 'summary' && (
              <div>
                <h3 style={{ fontSize: '16px', color: '#1e293b', marginBottom: '12px' }}>📅 สรุปสถิติการปฏิบัติงาน</h3>
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeaderRow}>
                        <th style={styles.th}>รหัสพนักงาน</th>
                        <th style={styles.th}>ชื่อ - นามสกุล</th>
                        <th style={styles.th}>จำนวนครั้งเข้างาน</th>
                        <th style={styles.th}>จำนวนครั้งออกงาน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(
                        logs.reduce((acc, log) => {
                          if (!acc[log.employee_code]) {
                            acc[log.employee_code] = {
                              code: log.employee_code,
                              name: log.employee_name,
                              checkInCount: 0,
                              checkOutCount: 0,
                            };
                          }
                          if (log.check_type === 'out') acc[log.employee_code].checkOutCount++;
                          else acc[log.employee_code].checkInCount++;
                          return acc;
                        }, {})
                      ).map((emp, index) => (
                        <tr key={index} style={styles.tableRow}>
                          <td style={styles.td}><span style={styles.badgeCode}>{emp.code}</span></td>
                          <td style={{ ...styles.td, fontWeight: '600' }}>{emp.name}</td>
                          <td style={styles.td}>{emp.checkInCount} ครั้ง</td>
                          <td style={styles.td}>{emp.checkOutCount} ครั้ง</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'employees' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ fontSize: '16px', color: '#1e293b', marginTop: 0, marginBottom: '12px' }}>➕ เพิ่มพนักงานใหม่เข้าระบบ</h3>
                  <form onSubmit={handleAddEmployee} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <input
                      type="text"
                      placeholder="รหัสพนักงาน (เช่น 1001)"
                      value={newEmpCode}
                      onChange={(e) => setNewEmpCode(e.target.value)}
                      required
                      style={styles.input}
                    />
                    <input
                      type="text"
                      placeholder="ชื่อ - นามสกุล"
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      required
                      style={styles.input}
                    />
                    <input
                      type="text"
                      placeholder="หน่วยงาน / หมู่บ้าน"
                      value={newEmpUnit}
                      onChange={(e) => setNewEmpUnit(e.target.value)}
                      style={styles.input}
                    />
                    <button type="submit" disabled={empLoading} style={styles.button}>
                      {empLoading ? 'กำลังบันทึก...' : '💾 บันทึกพนักงาน'}
                    </button>
                  </form>
                </div>

                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeaderRow}>
                        <th style={styles.th}>รหัสพนักงาน</th>
                        <th style={styles.th}>ชื่อ - นามสกุล</th>
                        <th style={styles.th}>หน่วยงาน</th>
                        <th style={styles.th}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeesList.map((emp) => (
                        <tr key={emp.id} style={styles.tableRow}>
                          <td style={styles.td}><span style={styles.badgeCode}>{emp.employee_code}</span></td>
                          <td style={{ ...styles.td, fontWeight: '600' }}>{emp.employee_name}</td>
                          <td style={styles.td}>{emp.unit || '-'}</td>
                          <td style={styles.td}>
                            <button
                              onClick={() => handleDeleteEmployee(emp.id)}
                              style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              🗑️ ลบ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'locations' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ fontSize: '16px', color: '#1e293b', margin: 0 }}>📍 เพิ่มจุดตรวจ / หน่วยงาน / พิกัด GPS ใหม่</h3>
                    <button type="button" onClick={handleGetCurrentGPS} style={{ ...styles.refreshBtn, backgroundColor: '#dbeafe', color: '#1e40af' }}>
                      📍 ดึงพิกัด GPS ปัจจุบันของฉัน
                    </button>
                  </div>
                  <form onSubmit={handleAddLocation} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <input
                      type="text"
                      placeholder="ชื่อหน่วยงาน / หมู่บ้าน"
                      value={newLocName}
                      onChange={(e) => setNewLocName(e.target.value)}
                      required
                      style={styles.input}
                    />
                    <input
                      type="text"
                      placeholder="Latitude (เช่น 13.756300)"
                      value={newLat}
                      onChange={(e) => setNewLat(e.target.value)}
                      required
                      style={styles.input}
                    />
                    <input
                      type="text"
                      placeholder="Longitude (เช่น 100.501800)"
                      value={newLng}
                      onChange={(e) => setNewLng(e.target.value)}
                      required
                      style={styles.input}
                    />
                    <input
                      type="number"
                      placeholder="รัศมี (เมตร) เช่น 100"
                      value={newRadius}
                      onChange={(e) => setNewRadius(e.target.value)}
                      required
                      style={styles.input}
                    />
                    <button type="submit" disabled={locLoading} style={{ ...styles.button, gridColumn: '1 / -1' }}>
                      {locLoading ? 'กำลังบันทึกพิกัด...' : '💾 บันทึกจุดตรวจใหม่'}
                    </button>
                  </form>
                </div>

                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeaderRow}>
                        <th style={styles.th}>ชื่อหน่วยงาน / จุดตรวจ</th>
                        <th style={styles.th}>Latitude</th>
                        <th style={styles.th}>Longitude</th>
                        <th style={styles.th}>รัศมี (เมตร)</th>
                        <th style={styles.th}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locations.map((loc) => (
                        <tr key={loc.id} style={styles.tableRow}>
                          <td style={{ ...styles.td, fontWeight: '600' }}>{loc.name}</td>
                          <td style={styles.td}>{loc.latitude}</td>
                          <td style={styles.td}>{loc.longitude}</td>
                          <td style={styles.td}>{loc.radius || 100} ม.</td>
                          <td style={styles.td}>
                            <button
                              onClick={() => handleDeleteLocation(loc.id)}
                              style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              🗑️ ลบ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { fontFamily: 'sans-serif', backgroundColor: '#f1f5f9', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  navBar: { backgroundColor: '#1e293b', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  navBrand: { display: 'flex', alignItems: 'center', gap: '12px' },
  navLogo: { width: '36px', height: '36px', objectFit: 'contain' },
  navTitleText: { fontSize: '18px', fontWeight: 'bold' },
  navButtons: { display: 'flex', gap: '8px' },
  navBtn: { background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  navBtnActive: { backgroundColor: '#0284c7', color: '#fff', borderColor: '#0284c7' },
  contentArea: { padding: '24px', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' },
  card: { backgroundColor: '#fff', padding: '32px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', width: '100%', maxWidth: '480px' },
  adminCard: { backgroundColor: '#fff', padding: '32px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', width: '100%', maxWidth: '1000px' },
  headerContainer: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  logo: { width: '48px', height: '48px', objectFit: 'contain' },
  companyName: { fontSize: '14px', fontWeight: 'bold', color: '#64748b' },
  title: { fontSize: '24px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 4px 0' },
  subtitle: { fontSize: '14px', color: '#64748b', margin: '0 0 24px 0' },
  modeToggle: { display: 'flex', gap: '8px', marginBottom: '20px' },
  modeBtn: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#64748b', fontWeight: '600', cursor: 'pointer' },
  modeBtnInActive: { backgroundColor: '#ecfdf5', borderColor: '#059669', color: '#047857' },
  modeBtnOutActive: { backgroundColor: '#fffbeb', borderColor: '#d97706', color: '#b45309' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '14px', fontWeight: '600', color: '#334155' },
  loadingText: { fontSize: '12px', color: '#0284c7', fontWeight: 'normal' },
  errorText: { fontSize: '13px', color: '#991b1b', fontWeight: '600' },
  input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none' },
  button: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' },
  alert: { marginTop: '16px', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', textAlign: 'center' },
  alertSuccess: { backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' },
  alertWarning: { backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' },
  alertError: { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' },
  adminHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '8px' },
  adminTitle: { fontSize: '20px', fontWeight: 'bold', color: '#1e293b', margin: 0 },
  adminSubtitle: { fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' },
  adminTabs: { display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' },
  adminTabBtn: { background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' },
  adminTabActive: { backgroundColor: '#0284c7', color: '#fff', borderColor: '#0284c7' },
  filterBar: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' },
  searchInput: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', flex: 1, minWidth: '200px' },
  filterSelect: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' },
  refreshBtn: { backgroundColor: '#e2e8f0', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', color: '#334155' },
  tableContainer: { overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' },
  tableHeaderRow: { backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' },
  th: { padding: '12px', color: '#475569', fontWeight: '600' },
  tableRow: { borderBottom: '1px solid #e2e8f0' },
  td: { padding: '12px', color: '#334155' },
  badgeCode: { backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', fontSize: '13px' },
  mapLink: { color: '#0284c7', fontWeight: '600', textDecoration: 'none' },
  loadingLogsText: { padding: '24px', textAlign: 'center', color: '#64748b' }
};

export default App;
