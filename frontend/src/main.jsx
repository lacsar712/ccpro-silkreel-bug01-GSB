import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, clearToken, setToken, token } from "./api.js";
import "./app.css";

const STATUS_LABEL = { soaking: "浸茧", reeling: "缫丝中", reeled: "已缫完" };

function Login({ onOk }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123456");
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(data.access_token);
      onOk();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <div class="login">
      <h1>江口缫丝坞</h1>
      <p>汤温环盆作业台，不是列表台账。</p>
      <form onSubmit={submit} autocomplete="off">
        <label>
          用户名
          <input name="username" autocomplete="off" value={username} onInput={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          密码
          <input name="password" type="password" autocomplete="off" value={password} onInput={(e) => setPassword(e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
        <button type="submit">登录</button>
      </form>
      {err && <p class="err">{err}</p>}
    </div>
  );
}

function Yard() {
  const [board, setBoard] = useState(null);
  const [pickedId, setPickedId] = useState(null);
  const [temp, setTemp] = useState("40");
  const [err, setErr] = useState("");
  const refreshSeq = useRef(0);

  // 环面与抽屉共用同一份 board；刷新只换数据，选择始终按盆 id 派生，
  // 迟到的旧响应一律丢弃，不得把抽屉拽回旧盆。
  async function refresh() {
    const seq = ++refreshSeq.current;
    try {
      const data = await api("/api/board");
      if (seq === refreshSeq.current) setBoard(data);
    } catch (e) {
      if (seq === refreshSeq.current) setErr(e.message);
    }
  }

  // 点盆只做一件事：换选中 id。抬头、近次汤温全部随该 id 从 board 取，
  // 与整页装载走同一条派生路径，不留旧盆字段。
  function pickBasin(b) {
    setErr("");
    setPickedId(b.id);
    refresh();
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!board) {
    return (
      <div class="yard">
        {err || "装载环盆…"}
      </div>
    );
  }

  const n = board.basins.length;
  const picked = pickedId === null ? null : board.basins.find((b) => b.id === pickedId) || null;

  async function writeTemp() {
    if (!picked) return;
    setErr("");
    // 提交时即固定盆 id：提交后即便人已改点邻盆，也不会写错盆。
    const basinId = picked.id;
    try {
      await api(`/api/basins/${basinId}/readings`, {
        method: "POST",
        body: JSON.stringify({ waterTempC: Number(temp) }),
      });
      await refresh();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  async function setStatus(status) {
    if (!picked) return;
    setErr("");
    const basinId = picked.id;
    try {
      await api(`/api/basins/${basinId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div class="yard">
      <div class="topbar">
        <div>
          <h1>{board.filature}</h1>
          <p>{board.riverside} · 点盆登记汤温；已缫完须最近汤温 38～42℃</p>
        </div>
        <button
          onClick={() => {
            clearToken();
            location.reload();
          }}
        >
          退出
        </button>
      </div>
      <div class="ring">
        {board.basins.map((b, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const left = 50 + Math.cos(angle) * 38;
          const top = 50 + Math.sin(angle) * 38;
          return (
            <button
              key={b.id}
              class={`basin ${b.status}${picked && picked.id === b.id ? " is-selected" : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => pickBasin(b)}
            >
              <strong>{b.code}</strong>
              <span>{STATUS_LABEL[b.status]}</span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div class="drawer">
          <h3>
            {picked.code} · {STATUS_LABEL[picked.status]}
          </h3>
          <p>
            最近汤温：{picked.latestTempC ?? "无"} ℃ · 记录{picked.readingCount} 次
          </p>
          <input value={temp} onInput={(e) => setTemp(e.target.value)} />
          <button onClick={writeTemp}>登记汤温</button>
          <div>
            <button onClick={() => setStatus("soaking")}>浸茧</button>
            <button onClick={() => setStatus("reeling")}>缫丝中</button>
            <button onClick={() => setStatus("reeled")}>已缫完</button>
          </div>
          {err && <p class="err">{err}</p>}
        </div>
      )}
    </div>
  );
}

function App() {
  const [ready, setReady] = useState(Boolean(token()));
  return ready ? <Yard /> : <Login onOk={() => setReady(true)} />;
}

render(<App />, document.getElementById("app"));
