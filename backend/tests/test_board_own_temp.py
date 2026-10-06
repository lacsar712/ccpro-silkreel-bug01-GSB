"""无数据库回归测试：/api/board 每盆只报自己的近次汤温，不掺邻盆。

用桩模块替换 quart / db / 仓储 / 安全层后导入真实的 app.main，
直接驱动真实 board() 路由函数。运行：python3 tests/test_board_own_temp.py
"""

import asyncio
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# --- quart 桩 ---
quart = types.ModuleType("quart")


class _App:
    def __init__(self, name):
        self.name = name

    def route(self, *args, **kwargs):
        return lambda f: f

    def before_request(self, f):
        return f


quart.Quart = _App
quart.jsonify = lambda obj: obj
quart.request = types.SimpleNamespace(headers={})
quart.g = types.SimpleNamespace(user=object())  # 已登录
helpers = types.ModuleType("quart.helpers")
helpers.make_response = lambda *a, **k: None
sys.modules["quart"] = quart
sys.modules["quart.helpers"] = helpers

# --- db 桩 ---
db = types.ModuleType("app.db")


class _SessionCtx:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, *a):
        return False


db.SessionLocal = lambda: _SessionCtx()
sys.modules["app.db"] = db

# --- models 桩（仅占位） ---
models = types.ModuleType("app.models")


class Basin:
    pass


models.Basin = Basin
sys.modules["app.models"] = models

# --- 仓储桩：返回内存中的坞 ---
MILL = None
repos = types.ModuleType("app.repositories")


class BasinRepo:
    def __init__(self, session):
        pass

    async def board(self):
        return MILL


class UserRepo:
    def __init__(self, session):
        pass


repos.BasinRepo = BasinRepo
repos.UserRepo = UserRepo
sys.modules["app.repositories"] = repos

# --- 安全层桩 ---
sec = types.ModuleType("app.security")
sec.make_token = lambda u: u
sec.parse_token = lambda t: None
sec.verify_password = lambda p, h: True
sys.modules["app.security"] = sec

from app.main import board  # noqa: E402


class Reading:
    def __init__(self, temp, taken_at):
        self.water_temp_c = temp
        self.taken_at = taken_at


class FakeBasin:
    def __init__(self, id, code, status, ring_index, readings):
        self.id = id
        self.code = code
        self.status = status
        self.ring_index = ring_index
        self.readings = readings


class Mill:
    name = "江口缫丝坞"
    riverside = "东津渡"

    def __init__(self, basins):
        self.basins = basins


async def main():
    global MILL
    now = datetime.now(timezone.utc)
    a = FakeBasin(1, "甲-1", "reeling", 0, [Reading(40.5, now - timedelta(hours=2))])
    b = FakeBasin(2, "乙-1", "reeled", 1, [Reading(39.2, now - timedelta(hours=1))])
    c = FakeBasin(3, "丙-1", "soaking", 2, [])
    MILL = Mill([c, a, b])  # 故意乱序，路由应按 ring_index 排回

    data = await board()
    rows = {r["code"]: r for r in data["basins"]}

    assert [r["code"] for r in data["basins"]] == ["甲-1", "乙-1", "丙-1"], data["basins"]
    assert rows["甲-1"]["latestTempC"] == 40.5, rows["甲-1"]
    # 修复前：乙-1 会背甲-1 的 40.5，丙-1 会背乙-1 的 39.2
    assert rows["乙-1"]["latestTempC"] == 39.2, rows["乙-1"]
    assert rows["丙-1"]["latestTempC"] is None, rows["丙-1"]
    assert rows["乙-1"]["readingCount"] == 1
    print("board 各盆只报自己的近次汤温：OK", {k: v["latestTempC"] for k, v in rows.items()})


if __name__ == "__main__":
    asyncio.run(main())
