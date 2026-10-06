// @vitest-environment jsdom
// 点盆作业链验收：环面色块 → 抽屉抬头 → 抽屉近次，全程不得混盆、不得踢人
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";

const h = vi.hoisted(() => {
  const state = {
    basins: [],
    hold: null, // 非空时所有 API 请求先等这个闸门，用来模拟在空中的慢请求
  };
  return { state, clearToken: vi.fn() };
});

vi.mock("../src/api.js", () => ({
  token: () => "tok",
  setToken: () => {},
  clearToken: h.clearToken,
  api: async (path, options = {}) => {
    if (h.state.hold) await h.state.hold;
    if (path === "/api/board") {
      return {
        filature: "江口缫丝坞",
        riverside: "东津渡",
        basins: h.state.basins.map((b) => ({ ...b })),
      };
    }
    let m = path.match(/^\/api\/basins\/(\d+)\/readings$/);
    if (m && options.method === "POST") {
      const b = h.state.basins.find((x) => x.id === Number(m[1]));
      b.latestTempC = JSON.parse(options.body).waterTempC;
      b.readingCount += 1;
      return { ...b };
    }
    m = path.match(/^\/api\/basins\/(\d+)\/status$/);
    if (m && options.method === "POST") {
      const b = h.state.basins.find((x) => x.id === Number(m[1]));
      b.status = JSON.parse(options.body).status;
      return { ...b };
    }
    throw new Error(`未 mock 的请求：${path}`);
  },
}));

import { Yard } from "../src/main.jsx";

function seed() {
  h.state.basins = [
    { id: 1, code: "甲-1", status: "reeling", ringIndex: 0, latestTempC: 40.5, readingCount: 1 },
    { id: 2, code: "乙-1", status: "reeled", ringIndex: 1, latestTempC: 39.2, readingCount: 1 },
  ];
  h.state.hold = null;
  h.clearToken.mockClear();
}

const drawer = () => document.querySelector(".drawer");
const tile = (code) => screen.getByText(code);

beforeEach(seed);
afterEach(cleanup);

describe("点盆作业链", () => {
  it("点乙盆后抽屉只出现乙盆的抬头和近次，与整页重载一致", async () => {
    render(<Yard />);
    await screen.findByText("甲-1");

    fireEvent.click(tile("乙-1"));
    await waitFor(() => expect(drawer().querySelector("h3").textContent).toContain("乙-1"));
    expect(drawer().textContent).toContain("39.2");
    expect(drawer().textContent).not.toContain("甲-1");
    expect(drawer().textContent).not.toContain("40.5");

    // 再点甲盆，也不得留乙盆的影子
    fireEvent.click(tile("甲-1"));
    await waitFor(() => expect(drawer().querySelector("h3").textContent).toContain("甲-1"));
    expect(drawer().textContent).toContain("40.5");
    expect(drawer().textContent).not.toContain("乙-1");
    expect(drawer().textContent).not.toContain("39.2");

    // 模拟整页刷新（卸载重挂）：点同一口盆，抽屉必须一样
    cleanup();
    render(<Yard />);
    await screen.findByText("乙-1");
    fireEvent.click(tile("乙-1"));
    await waitFor(() => expect(drawer().querySelector("h3").textContent).toContain("乙-1"));
    expect(drawer().textContent).toContain("39.2");
    expect(drawer().textContent).not.toContain("40.5");
    expect(h.clearToken).not.toHaveBeenCalled();
  });

  it("交叉点相邻两盆，慢请求回来时抽屉仍稳定在最后点中的盆", async () => {
    render(<Yard />);
    await screen.findByText("甲-1");

    // 闸住请求：甲盆的登记悬在空中
    let release;
    h.state.hold = new Promise((res) => (release = res));

    fireEvent.click(tile("甲-1"));
    await waitFor(() => expect(drawer().querySelector("h3").textContent).toContain("甲-1"));
    fireEvent.click(screen.getByText("登记汤温")); // 甲盆写请求被闸门扣住
    fireEvent.click(tile("乙-1")); // 工人随即点乙盆
    release(); // 甲盆的慢请求这才回来

    await waitFor(() => expect(drawer().querySelector("h3").textContent).toContain("乙-1"));
    expect(drawer().textContent).toContain("39.2");
    expect(drawer().textContent).not.toContain("甲-1");
    expect(drawer().textContent).not.toContain("40.5");
    expect(h.clearToken).not.toHaveBeenCalled();
  });

  it("登记汤温后抽屉近次跟到本盆新值，不串邻盆", async () => {
    render(<Yard />);
    await screen.findByText("乙-1");

    fireEvent.click(tile("乙-1"));
    await waitFor(() => expect(drawer().querySelector("h3").textContent).toContain("乙-1"));
    fireEvent.input(drawer().querySelector("input"), { target: { value: "41" } });
    fireEvent.click(screen.getByText("登记汤温"));

    await waitFor(() => expect(drawer().textContent).toContain("41"));
    expect(drawer().querySelector("h3").textContent).toContain("乙-1");
    expect(drawer().textContent).toContain("记录 2 次");
    expect(drawer().textContent).not.toContain("甲-1");
    expect(h.clearToken).not.toHaveBeenCalled();
  });
});
