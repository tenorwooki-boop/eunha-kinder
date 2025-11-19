// src/App.jsx
import React from "react"

// ====== Firebase (통학버스 Firestore 사용) ======
import { db } from "./firebaseConfig"
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
} from "firebase/firestore"

// ===== 상수/유틸 =====
const ADMIN_PIN = "0000" // 관리자 비밀번호(원하시는 값으로 바꾸세요)

const CLASSES = [
  { id: "green",    name: "초록반" },
  { id: "yellow",   name: "노랑반" },
  { id: "squirrel", name: "다람쥐반" },
  { id: "rabbit",   name: "토끼반" },
  { id: "giraffe",  name: "기린반" },
  { id: "deer",     name: "사슴반" },
  { id: "koala",    name: "코알라반" },
]

// 결석/학생 정보는 계속 localStorage 사용
const LS_ATTEND   = "eunha-absent-v1"
const LS_STUDENTS = "eunha-students-v1"

const todayStr = () => {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

const normalize = (s) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim()
const isKoreanLoose = (s) => /^[\p{L}\p{N}\s·\-\(\)]+$/u.test(s)
const classNameById = (id) => (CLASSES.find(c => c.id === id)?.name || "")

// ===== 스타일 =====
const wrap = { maxWidth: 960, margin: "0 auto", padding: 16, fontFamily: "ui-sans-serif, system-ui" }
const card = { border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, background: "#fff" }
const inputBox = { padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }
const btn = { padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }
const smallBtn = { padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor:"pointer" }
const segWrap = { display: "flex", gap: 6, flexWrap: "wrap" }
const segBtn = (active) => ({
  padding: "8px 12px",
  borderRadius: 999,
  border: `1px solid ${active ? "#10b981" : "#d1d5db"}`,
  background: active ? "#ecfdf5" : "#fff",
  color: active ? "#065F46" : "#111827",
  fontWeight: 600,
  cursor: "pointer"
})
const chip = { display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", border:"1px solid #d1d5db", borderRadius:999, background:"#f9fafb", fontSize:12 }
const bigBtn = (bg, color="#111827") => ({
  padding: "20px 36px",
  borderRadius: 20,
  border: "none",
  backgroundColor: bg,
  color,
  fontSize: 20,
  fontWeight: 600,
  boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
  cursor: "pointer",
  width: "100%"
})

// ===== 앱 =====
export default function App() {
  const [section, setSection] = React.useState("home") // 'home' | 'absence' | 'bus'

  // PWA 설치/오프라인 표시
  const [installPrompt, setInstallPrompt] = React.useState(null)
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine)
  React.useEffect(() => {
    const onBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e) }
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])
  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  // 공통 헤더
  const Header = () => (
    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:12}}>
      <h1 style={{margin:"8px 0"}}>은하 유치원</h1>
      <div style={{display:"flex", gap:8}}>
        {isOffline && <div style={{padding:"6px 10px", border:"1px solid #ef4444", borderRadius:8, fontSize:12}}>오프라인</div>}
        <button onClick={handleInstall} disabled={!installPrompt} style={{...btn, cursor: installPrompt ? "pointer" : "not-allowed"}}>앱 설치</button>
      </div>
    </div>
  )

  // 홈
  const Home = () => (
    <div style={{display:"grid", gap:12, maxWidth: 520, margin:"0 auto", marginTop:"8vh"}}>
      <button style={bigBtn("#A7F3D0", "#065F46")} onClick={()=>setSection("absence")}>📋 결석현황</button>
      <button style={bigBtn("#DBEAFE", "#1E3A8A")} onClick={()=>setSection("bus")}>🚌 통학버스</button>
    </div>
  )

  // 관리자 모드
  const [admin, setAdmin] = React.useState(false)
  const toggleAdmin = () => {
    if (admin) { setAdmin(false); return }
    const input = prompt("관리자 비밀번호를 입력하세요.")
    if (input === ADMIN_PIN) setAdmin(true)
    else alert("비밀번호가 올바르지 않습니다.")
  }

  // ===== 통학버스 (Firestore) =====
  const Bus = () => {
    const [mapQuery, setMapQuery] = React.useState("검단신도시")
    const [mapSearchTerm, setMapSearchTerm] = React.useState("검단신도시")
    const busSearchRef = React.useRef(null)

    // Firestore에서 통학버스 목록 실시간 구독
    const [busList, setBusList] = React.useState([])
    React.useEffect(() => {
      const q = query(collection(db, "busStops"), orderBy("apt"))
      const unsub = onSnapshot(q, (snap) => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setBusList(rows)
      })
      return () => unsub()
    }, [])

    // 등록 폼 refs
    const aptRef   = React.useRef(null)
    const stopRef  = React.useRef(null)
    const inRef    = React.useRef(null)
    const outRef   = React.useRef(null)
    const out2Ref  = React.useRef(null)

    // 없음 체크
    const [inNone, setInNone] = React.useState(false)
    const [outNone, setOutNone] = React.useState(false)
    const [out2None, setOut2None] = React.useState(false)

    // 전체목록 시간 편집 상태
    const [editTimes, setEditTimes] = React.useState({})
    React.useEffect(() => {
      const init = {}
      busList.forEach(it => {
        init[it.id] = {
          inTime: it.inTime || "",
          outTime: it.outTime || "",
          outTime2: it.outTime2 || "",
          inNone: !it.inTime,
          outNone: !it.outTime,
          out2None: !it.outTime2
        }
      })
      setEditTimes(init)
    }, [busList])

    const updateEdit = (id, field, value) => {
      setEditTimes(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
    }
    const updateNone = (id, field, checked) => {
      setEditTimes(prev => {
        const t = { ...(prev[id] || {}) }
        t[field] = checked
        if (field === "inNone" && checked) t.inTime = ""
        if (field === "outNone" && checked) t.outTime = ""
        if (field === "out2None" && checked) t.outTime2 = ""
        return { ...prev, [id]: t }
      })
    }

    // Firestore에 항목 추가
    const addBusItem = async () => {
      if (!admin) return
      const apt     = normalize(aptRef.current?.value || "")
      const stop    = normalize(stopRef.current?.value || "")
      const inTime  = inNone  ? "" : (inRef.current?.value  || "")
      const outTime = outNone ? "" : (outRef.current?.value || "")
      const outTime2 = out2None ? "" : (out2Ref.current?.value || "")

      if (!apt)  { alert("아파트 이름을 입력하세요."); aptRef.current?.focus(); return }
      if (!stop) { alert("상·하차 장소를 입력하세요."); stopRef.current?.focus(); return }
      if (!inNone && !inTime){ alert("등원시간을 입력하거나 '없음'을 체크하세요."); inRef.current?.focus(); return }
      if (!outNone && !outTime){ alert("하원(1차)을 입력하거나 '없음'을 체크하세요."); outRef.current?.focus(); return }
      if (!isKoreanLoose(apt) || !isKoreanLoose(stop)) {
        alert("아파트/상·하차는 한글/영문/숫자/괄호/하이픈/공백만 허용됩니다.")
        return
      }

      await addDoc(collection(db, "busStops"), {
        apt, stop, inTime, outTime, outTime2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      // 입력 초기화
      aptRef.current.value = ""
      stopRef.current.value = ""
      if (inRef.current) inRef.current.value = ""
      if (outRef.current) outRef.current.value = ""
      if (out2Ref.current) out2Ref.current.value = ""
      setInNone(false); setOutNone(false); setOut2None(false)
      aptRef.current?.focus()
    }

    // Firestore에 시간 수정 저장
    const saveEditedTimes = async (id) => {
      const t = editTimes[id] || {}
      await updateDoc(doc(db, "busStops", id), {
        inTime:  t.inNone  ? "" : (t.inTime || ""),
        outTime: t.outNone ? "" : (t.outTime || ""),
        outTime2:t.out2None? "" : (t.outTime2 || ""),
        updatedAt: serverTimestamp()
      })
      alert("시간이 저장되었습니다.")
    }

    // Firestore에서 삭제
    const removeBusItem = async (id) => {
      if (!admin) return
      if (!confirm("해당 항목을 삭제할까요?")) return
      await deleteDoc(doc(db, "busStops", id))
    }

    // 검색
    const applyBusSearch = () => {
      const q = normalize(busSearchRef.current?.value || "")
      const finalQ = q || "검단신도시"
      setMapQuery(finalQ); setMapSearchTerm(finalQ)
    }

    const filter = normalize(mapSearchTerm).toLowerCase()
    const filtered = busList
      .filter(it => {
        const a = normalize(it.apt).toLowerCase()
        const s = normalize(it.stop).toLowerCase()
        return !filter || a.includes(filter) || s.includes(filter)
      })
      .sort((x,y)=> normalize(x.apt).localeCompare(normalize(y.apt),"ko"))

    return (
      <>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
          <div style={{fontSize:20, fontWeight:700}}>통학버스</div>
          <div style={{display:"flex", gap:8}}>
            <button
              onClick={toggleAdmin}
              style={{...btn, background: admin ? "#dcfce7" : "#fff", borderColor: admin ? "#86efac" : "#d1d5db", color:"#065F46", fontWeight:600}}
            >
              {admin ? "관리자모드: ON" : "관리자모드"}
            </button>
            <button style={btn} onClick={()=>setSection("home")}>← 홈으로</button>
          </div>
        </div>

        {/* 검색창 */}
        <div style={{...card, background:"#f9fafb", marginBottom:12}}>
          <div style={{fontWeight:700, marginBottom:10}}>지역/아파트 검색</div>
          <div style={{display:"grid", gridTemplateColumns:"1fr auto auto", gap:8}}>
            <input
              ref={busSearchRef}
              placeholder="예: 검단신도시, 왕길동, 로얄파크씨티푸르지오, 상하차 장소"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              lang="ko"
              style={inputBox}
              onKeyDown={(e)=>{ if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); applyBusSearch() } }}
            />
            <button style={btn} onClick={applyBusSearch}>검색</button>
            <button
              style={btn}
              onClick={()=>{
                if (busSearchRef.current) busSearchRef.current.value=""
                setMapQuery("검단신도시"); setMapSearchTerm("검단신도시")
              }}
            >
              초기화
            </button>
          </div>
          <div style={{marginTop:8}}>
            <span style={chip}>검색어: <strong>{mapSearchTerm || "검단신도시"}</strong></span>
          </div>
        </div>

        {/* 검색 결과 */}
        <div style={{...card, marginBottom:12}}>
          <div style={{fontWeight:700, marginBottom:8}}>검색 결과</div>
          {filtered.length === 0 ? (
            <div style={{opacity:.6}}>일치하는 결과가 없습니다. (등록을 추가해보세요)</div>
          ) : (
            <div style={{display:"grid", gap:8}}>
              {filtered.map(item => (
                <div key={item.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px dashed #eee", paddingBottom:8}}>
                  <div>
                    <div style={{fontWeight:700}}>{item.apt}</div>
                    <div style={{fontSize:13, opacity:.9}}>상·하차: {item.stop}</div>
                    <div style={{fontSize:13, opacity:.9, marginTop:2}}>
                      등원: <strong>{item.inTime || "-"}</strong>
                      {" / "}하원(1차): <strong>{item.outTime || "-"}</strong>
                      {" / "}하원(2차): <strong>{item.outTime2 || "-"}</strong>
                    </div>
                  </div>
                  <div style={{display:"flex", gap:8}}>
                    <button
                      style={smallBtn}
                      title="지도에서 보기"
                      onClick={()=> setMapQuery(`${item.apt} ${item.stop}`)}
                    >
                      지도보기
                    </button>
                    {admin && (
                      <button style={{...smallBtn, background:"#fee2e2"}} onClick={()=>removeBusItem(item.id)}>삭제</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 관리자 전용: 전체 등록목록 (시간 수정) */}
        {admin && (
          <div style={{...card, background:"#f9fafb", marginBottom:12}}>
            <div style={{fontWeight:700, marginBottom:8}}>전체 등록목록 (시간 수정)</div>
            {busList.length === 0 ? (
              <div style={{opacity:.6}}>등록된 항목이 없습니다.</div>
            ) : (
              <div style={{display:"grid", gap:12}}>
                {busList
                  .slice()
                  .sort((x,y)=> normalize(x.apt).localeCompare(normalize(y.apt),"ko"))
                  .map(item => {
                    const t = editTimes[item.id] || { inTime:"", outTime:"", outTime2:"", inNone:false, outNone:false, out2None:false }
                    return (
                      <div key={item.id} style={{display:"grid", gap:8, borderBottom:"1px dashed #e5e7eb", paddingBottom:8}}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                          <div>
                            <div style={{fontWeight:700}}>{item.apt}</div>
                            <div style={{fontSize:13, opacity:.9}}>상·하차: {item.stop}</div>
                          </div>
                          <div style={{display:"flex", gap:8}}>
                            <button style={smallBtn} onClick={()=> setMapQuery(`${item.apt} ${item.stop}`)}>지도보기</button>
                            <button style={{...smallBtn, background:"#fee2e2"}} onClick={()=>removeBusItem(item.id)}>삭제</button>
                          </div>
                        </div>

                        <div style={{display:"grid", gridTemplateColumns:"1fr auto 1fr auto 1fr auto auto", gap:8, alignItems:"center"}}>
                          <input
                            type="time"
                            step={60}
                            style={inputBox}
                            value={t.inTime}
                            disabled={t.inNone}
                            onChange={(e)=>updateEdit(item.id, "inTime", e.target.value)}
                            title="등원시간"
                          />
                          <label style={{display:"flex", alignItems:"center", gap:6}}>
                            <input
                              type="checkbox"
                              checked={!!t.inNone}
                              onChange={(e)=>updateNone(item.id, "inNone", e.target.checked)}
                            /> 없음
                          </label>

                          <input
                            type="time"
                            step={60}
                            style={inputBox}
                            value={t.outTime}
                            disabled={t.outNone}
                            onChange={(e)=>updateEdit(item.id, "outTime", e.target.value)}
                            title="하원시간(1차)"
                          />
                          <label style={{display:"flex", alignItems:"center", gap:6}}>
                            <input
                              type="checkbox"
                              checked={!!t.outNone}
                              onChange={(e)=>updateNone(item.id, "outNone", e.target.checked)}
                            /> 없음
                          </label>

                          <input
                            type="time"
                            step={60}
                            style={inputBox}
                            value={t.outTime2}
                            disabled={t.out2None}
                            onChange={(e)=>updateEdit(item.id, "outTime2", e.target.value)}
                            title="하원시간(2차)"
                          />
                          <label style={{display:"flex", alignItems:"center", gap:6}}>
                            <input
                              type="checkbox"
                              checked={!!t.out2None}
                              onChange={(e)=>updateNone(item.id, "out2None", e.target.checked)}
                            /> 없음
                          </label>

                          <button style={{...btn, background:"#dcfce7"}} onClick={()=>saveEditedTimes(item.id)}>저장</button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* 관리자 전용: 등록 폼 */}
        {admin && (
          <div style={{...card, background:"#f9fafb", marginBottom:12}}>
            <div style={{fontWeight:700, marginBottom:10}}>아파트/상·하차/시간 등록</div>

            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8}}>
              <input
                ref={aptRef}
                placeholder="아파트 이름"
                autoComplete="off"
                spellCheck={false}
                lang="ko"
                style={inputBox}
                onKeyDown={(e)=>{ if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addBusItem() } }}
              />
              <input
                ref={stopRef}
                placeholder="상·하차 장소"
                autoComplete="off"
                spellCheck={false}
                lang="ko"
                style={inputBox}
                onKeyDown={(e)=>{ if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addBusItem() } }}
              />
            </div>

            <div style={{display:"grid", gridTemplateColumns:"1fr auto 1fr auto 1fr auto auto", gap:8, alignItems:"center"}}>
              <input
                ref={inRef}
                type="time"
                step={60}
                style={inputBox}
                title="등원시간"
                disabled={inNone}
              />
              <label style={{display:"flex", alignItems:"center", gap:6}}>
                <input
                  type="checkbox"
                  checked={inNone}
                  onChange={(e)=>{
                    setInNone(e.target.checked)
                    if (e.target.checked && inRef.current) inRef.current.value = ""
                  }}
                /> 없음
              </label>

              <input
                ref={outRef}
                type="time"
                step={60}
                style={inputBox}
                title="하원시간(1차)"
                disabled={outNone}
              />
              <label style={{display:"flex", alignItems:"center", gap:6}}>
                <input
                  type="checkbox"
                  checked={outNone}
                  onChange={(e)=>{
                    setOutNone(e.target.checked)
                    if (e.target.checked && outRef.current) outRef.current.value = ""
                  }}
                /> 없음
              </label>

              <input
                ref={out2Ref}
                type="time"
                step={60}
                style={inputBox}
                title="하원시간(2차)"
                disabled={out2None}
              />
              <label style={{display:"flex", alignItems:"center", gap:6}}>
                <input
                  type="checkbox"
                  checked={out2None}
                  onChange={(e)=>{
                    setOut2None(e.target.checked)
                    if (e.target.checked && out2Ref.current) out2Ref.current.value = ""
                  }}
                /> 없음
              </label>

              <button style={{...btn, background:"#dcfce7"}} onClick={addBusItem}>등록</button>
            </div>
          </div>
        )}

        {/* 지도 */}
        <div style={{...card, padding:0, overflow:"hidden"}}>
          <iframe
            title="지도"
            style={{border:0, width:"100%", height:"60vh"}}
            src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <div style={{opacity:.6, fontSize:12, marginTop:10}}>
          ※ 지도는 인터넷 연결이 필요합니다. (오프라인 상태에선 표시가 제한될 수 있어요)
        </div>
      </>
    )
  }

  // ===== 결석현황 (기존대로 localStorage 사용) =====
  const Absence = () => {
    const [selDate, setSelDate] = React.useState(todayStr())
    const [selClass, setSelClass] = React.useState(CLASSES[0].id)

    const [studentsMap, setStudentsMap] = React.useState(() => {
      try { return JSON.parse(localStorage.getItem(LS_STUDENTS) || "{}") } catch { return {} }
    })
    const [attendance, setAttendance] = React.useState(() => {
      try { return JSON.parse(localStorage.getItem(LS_ATTEND) || "{}") } catch { return {} }
    })

    const saveStudents = (next) => { setStudentsMap(next); localStorage.setItem(LS_STUDENTS, JSON.stringify(next)) }
    const saveAttendance = (next) => { setAttendance(next); localStorage.setItem(LS_ATTEND, JSON.stringify(next)) }

    const attForDaySel = attendance?.[selDate]?.[selClass] || {}

    const [addClassId, setAddClassId] = React.useState(selClass)
    React.useEffect(() => { setAddClassId(selClass) }, [selClass])
    const studentInputRef = React.useRef(null)
    const addStudent = () => {
      if (!admin) return
      const raw = studentInputRef.current?.value || ""
      const name = normalize(raw)
      if (!name) { alert("이름을 입력하세요."); studentInputRef.current?.focus(); return }
      if (!isKoreanLoose(name)) { alert("한글/숫자/괄호/하이픈/공백만 입력 가능합니다."); studentInputRef.current?.focus(); return }

      const list = studentsMap[addClassId] ? [...studentsMap[addClassId]] : []
      if (list.some(n => normalize(n) === name)) {
        alert(`이미 등록된 이름입니다. (${classNameById(addClassId)})`)
        studentInputRef.current?.focus()
        return
      }
      const next = { ...studentsMap, [addClassId]: [...list, name].sort((a,b)=>a.localeCompare(b,"ko")) }
      saveStudents(next)
      studentInputRef.current.value = ""
      studentInputRef.current.focus()
    }

    const removeStudentFrom = (classId, name) => {
      if (!admin) return
      if (!confirm(`"${name}" 학생을 삭제할까요? (${classNameById(classId)})`)) return
      const nextStudents = { ...studentsMap, [classId]: (studentsMap[classId] || []).filter(s => s !== name) }
      saveStudents(nextStudents)
      const nextAttend = structuredClone(attendance)
      Object.keys(nextAttend).forEach(date => {
        if (nextAttend[date]?.[classId]?.[name]) delete nextAttend[date][classId][name]
      })
      saveAttendance(nextAttend)
    }

    const toggleAbsentFor = (classId, name, checked) => {
      const next = structuredClone(attendance)
      next[selDate] = next[selDate] || {}
      next[selDate][classId] = next[selDate][classId] || {}
      if (checked) next[selDate][classId][name] = true
      else delete next[selDate][classId][name]
      saveAttendance(next)
    }

    const clearTodayClass = () => {
      const next = structuredClone(attendance)
      if (next[selDate]?.[selClass]) {
        next[selDate][selClass] = {}
        saveAttendance(next)
      }
    }

    const [searchQuery, setSearchQuery] = React.useState("")
    const searchInputRef = React.useRef(null)
    const applySearch = () => setSearchQuery(normalize(searchInputRef.current?.value || ""))

    const makeCurrentClassList = () =>
      (studentsMap[selClass] || [])
        .slice()
        .sort((a,b)=>a.localeCompare(b,"ko"))
        .map(name => ({ classId: selClass, name }))

    const makeGlobalSearchList = () => {
      const q = normalize(searchQuery).toLowerCase()
      const rows = []
      Object.entries(studentsMap).forEach(([classId, arr]) => {
        (arr||[]).forEach(name=>{
          const n = normalize(name)
          if (!q || n.toLowerCase().includes(q)) rows.push({ classId, name })
        })
      })
      rows.sort((a,b)=>{
        const cn = classNameById(a.classId).localeCompare(classNameById(b.classId),"ko")
        if (cn!==0) return cn
        return a.name.localeCompare(b.name,"ko")
      })
      return rows
    }

    const showingSearch = normalize(searchQuery).length>0
    const listRows = showingSearch ? makeGlobalSearchList() : makeCurrentClassList()

    return (
      <>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
          <button
            onClick={toggleAdmin}
            style={{...btn, background: admin ? "#dcfce7" : "#fff", borderColor: admin ? "#86efac" : "#d1d5db", color:"#065F46", fontWeight:600}}
          >
            {admin ? "관리자모드: ON" : "관리자모드"}
          </button>
          <button style={btn} onClick={()=>setSection("home")}>← 홈으로</button>
        </div>

        {/* 날짜/반 */}
        <div style={{...card, background:"#f9fafb", marginBottom:16}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr", gap:12}}>
            <label style={{display:"grid", gap:6}}>
              <span style={{fontSize:12, opacity:.7}}>날짜</span>
              <input type="date" value={selDate} onChange={(e)=>setSelDate(e.target.value)} style={inputBox} />
            </label>
            <div>
              <div style={{fontSize:12, opacity:.7, marginBottom:6}}>반 선택(보기)</div>
              <div style={segWrap}>
                {CLASSES.map(c => (
                  <button key={c.id} type="button" style={segBtn(selClass === c.id)} onClick={()=>setSelClass(c.id)}>{c.name}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 집계 */}
        <div style={{...card, background:"#ecfdf5", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <div><strong>📊 결석 인원:</strong> {Object.keys(attForDaySel).length}명 / 총 {(studentsMap[selClass]||[]).length}명</div>
          <button style={{...btn, background:"#f0fdf4"}} onClick={clearTodayClass}>오늘 초기화</button>
        </div>

        {/* 학생 관리 */}
        <div style={{...card, background:"#f9fafb"}}>
          <h3 style={{margin:"0 0 12px"}}>학생 관리</h3>

          {admin && (
            <>
              <div style={{...segWrap, marginBottom:10}}>
                {CLASSES.map(c => (
                  <button key={c.id} type="button" style={segBtn(addClassId === c.id)} onClick={()=>setAddClassId(c.id)} title={`${c.name}에 등록`}>
                    {c.name}
                  </button>
                ))}
              </div>

              <div style={{display:"grid", gridTemplateColumns:"1fr auto", gap:8, marginBottom:12}}>
                <input
                  ref={studentInputRef}
                  placeholder="학생 이름(한글) 입력"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  lang="ko"
                  style={inputBox}
                  onKeyDown={(e)=>{ if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addStudent(); } }}
                  autoFocus
                />
                <button type="button" style={{...btn, background:"#dcfce7"}} onClick={addStudent}>추가</button>
              </div>
              <div style={{fontSize:12, opacity:.7, marginTop:-6, marginBottom:10}}>
                등록 반: <strong>{classNameById(addClassId)}</strong> — 목록 표시는 <strong>(반) 이름</strong> 형식입니다.
              </div>
            </>
          )}

          {/* 통합 검색 */}
          <div style={{display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, marginBottom:10}}>
            <input
              ref={searchInputRef}
              placeholder="학생 검색 — 모든 반에서 찾습니다 (예: 김민준)"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              lang="ko"
              style={inputBox}
              onKeyDown={(e)=>{ if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); applySearch(); } }}
            />
            <button style={btn} onClick={applySearch}>검색</button>
            <button
              style={btn}
              onClick={()=>{
                if (searchInputRef.current) searchInputRef.current.value=""
                setSearchQuery("")
              }}
            >
              지우기
            </button>
          </div>

          {/* 목록 */}
          <div style={{background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:10}}>
            {listRows.length === 0 ? (
              <div style={{opacity:.6, textAlign:"center", padding:12}}>
                {normalize(searchQuery) ? "검색 결과가 없습니다." : "이 반의 학생이 없습니다."}
              </div>
            ) : (
              <>
                {normalize(searchQuery) && (
                  <div style={{opacity:.7, fontSize:12, padding:"4px 2px 8px"}}>
                    전체 반에서 <strong>{listRows.length}</strong>건을 찾았어요. (검색어: {searchQuery})
                  </div>
                )}
                {listRows.map(({ classId, name }) => {
                  const checked = !!(attendance?.[selDate]?.[classId]?.[name])
                  const label = `(${classNameById(classId)}) ${name}`
                  return (
                    <div key={`${classId}::${name}`} style={{display:"flex", justifyContent:"space-between", borderBottom:"1px dashed #eee", padding:"8px 4px"}}>
                      <div>{label}</div>
                      <div style={{display:"flex", alignItems:"center", gap:10}}>
                        <label style={{display:"flex", alignItems:"center", gap:6}}>
                          <span style={{fontSize:12, opacity:.7}}>결석</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e)=>toggleAbsentFor(classId, name, e.target.checked)}
                            style={{width:20, height:20}}
                          />
                        </label>
                        {admin && (
                          <button
                            style={{...smallBtn, background:"#fee2e2"}}
                            onClick={()=>removeStudentFrom(classId, name)}
                            title={`${classNameById(classId)}에서 삭제`}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div style={wrap}>
      <Header />
      {section === "home" ? <Home /> : section === "bus" ? <Bus /> : <Absence />}
    </div>
  )
}
