// All rectangles use workspace coordinates. The nearest legal position lies at
// the requested coordinate, a workspace edge, or an edge of an obstacle.
const gap = 10;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function freePosition(
  target,
  size,
  bounds,
  obstacles,
  allowed = () => true,
) {
  const maxX = bounds.width - size.width - gap;
  const maxY = bounds.height - size.height - gap;
  if (maxX < gap || maxY < gap) return null;
  const xs = new Set([gap, maxX, clamp(target.x, gap, maxX)]);
  const ys = new Set([gap, maxY, clamp(target.y, gap, maxY)]);
  for (const r of obstacles) {
    xs.add(clamp(r.x - gap - size.width, gap, maxX));
    xs.add(clamp(r.x + r.width + gap, gap, maxX));
    ys.add(clamp(r.y - gap - size.height, gap, maxY));
    ys.add(clamp(r.y + r.height + gap, gap, maxY));
  }
  let best = null,
    distance = Infinity;
  for (const x of xs)
    for (const y of ys) {
      const score = (target.x - x) ** 2 + (target.y - y) ** 2;
      if (score >= distance || !allowed(x, y)) continue;
      if (
        obstacles.some(
          (r) =>
            x < r.x + r.width + gap &&
            x + size.width + gap > r.x &&
            y < r.y + r.height + gap &&
            y + size.height + gap > r.y,
        )
      )
        continue;
      best = { x, y };
      distance = score;
    }
  return best;
}

export function widgetLayout(layer, readPosition, savePosition) {
  const workspace = document.querySelector("#home-workspace");
  const center = document.querySelector("#home-center");
  const room = document.querySelector("#widget-room");
  const header = document.querySelector("header.bar");
  const footer = document.querySelector("footer.bar");
  const cards = [...layer.querySelectorAll(".widget")];
  const contents = [...center.querySelectorAll(".hero, #search, .favorites")];
  let frame = 0,
    drag;
  function rectangle(el) {
    const box = el.getBoundingClientRect(),
      origin = workspace.getBoundingClientRect();
    return {
      x: box.left - origin.left,
      y: box.top - origin.top,
      width: box.width,
      height: box.height,
    };
  }
  function obstacles() {
    return contents.filter((el) => el.getClientRects().length).map(rectangle);
  }
  function place(card, pos) {
    card.style.left = pos.x + "px";
    card.style.top = pos.y + "px";
  }
  function arrange() {
    cancelAnimationFrame(frame);
    if (!layer.getClientRects().length) {
      room.style.height = "";
      return;
    }
    const barHeight = [header, footer].reduce((height, bar) => {
      const style = getComputedStyle(bar);
      return (
        height +
        bar.getBoundingClientRect().height +
        parseFloat(style.marginTop) +
        parseFloat(style.marginBottom)
      );
    }, 0);
    workspace.style.setProperty("--bars-height", barHeight + "px");
    const base = center.getBoundingClientRect().height;
    const width = workspace.clientWidth;
    const taken = obstacles();
    let height = base;
    for (const card of cards.filter((el) => !el.hidden)) {
      const size = rectangle(card);
      const saved = readPosition(card.id);
      const rangeX = Math.max(1, width - size.width);
      const target = saved
        ? { x: saved.x * rangeX, y: saved.y * base }
        : {
            x: card.id === "todo-widget" ? 20 : rangeX - 20,
            y: (base - size.height) / 2,
          };
      // Preserve a deliberate placement below the central content on small screens.
      if (saved?.y > 0 && target.y + size.height > base)
        height = Math.max(
          height,
          Math.min(
            base + 2 * (size.height + 2 * gap),
            target.y + size.height + gap,
          ),
        );
      let pos = freePosition(target, size, { width, height }, taken);
      if (!pos) {
        height += size.height + 2 * gap;
        pos = freePosition(target, size, { width, height }, taken);
      }
      if (!pos) continue;
      place(card, pos);
      taken.push({ ...pos, width: size.width, height: size.height });
    }
    const bottom = Math.max(base, ...taken.map((r) => r.y + r.height + gap));
    const extra = Math.ceil(bottom - base);
    room.style.height =
      extra + (extra && drag ? drag.card.offsetHeight + 2 * gap : 0) + "px";
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(arrange);
  }
  const observer = new ResizeObserver(schedule);
  for (const el of [center, header, footer, ...cards, ...contents])
    observer.observe(el);
  new MutationObserver(schedule).observe(document.querySelector("#results"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  function move(card, target, allowed) {
    const taken = obstacles().concat(
      cards.filter((el) => el !== card && !el.hidden).map(rectangle),
    );
    const pos = freePosition(
      target,
      rectangle(card),
      { width: workspace.clientWidth, height: workspace.clientHeight },
      taken,
      allowed,
    );
    if (pos) place(card, pos);
  }
  function remember(card) {
    const box = rectangle(card);
    savePosition(card.id, {
      x: box.x / Math.max(1, workspace.clientWidth - box.width),
      y: box.y / Math.max(1, center.getBoundingClientRect().height),
    });
    schedule();
  }
  for (const card of cards) {
    const handle = card.querySelector(".move-widget");
    handle.onpointerdown = (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      const box = card.getBoundingClientRect();
      drag = {
        card,
        pointer: event.pointerId,
        dx: event.clientX - box.x,
        dy: event.clientY - box.y,
      };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("moving");
      arrange();
    };
    handle.onpointermove = (event) => {
      if (drag?.card !== card || drag.pointer !== event.pointerId) return;
      if (event.clientY > innerHeight - 36) window.scrollBy(0, 18);
      else if (event.clientY < 36) window.scrollBy(0, -18);
      const origin = workspace.getBoundingClientRect();
      move(card, {
        x: event.clientX - origin.x - drag.dx,
        y: event.clientY - origin.y - drag.dy,
      });
    };
    handle.onpointerup = (event) => {
      if (drag?.card !== card || drag.pointer !== event.pointerId) return;
      drag = undefined;
      handle.classList.remove("moving");
      remember(card);
    };
    handle.onlostpointercapture = () => {
      if (drag?.card !== card) return;
      drag = undefined;
      handle.classList.remove("moving");
      schedule();
    };
    handle.onkeydown = (event) => {
      const delta = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      const box = rectangle(card);
      const step = event.shiftKey ? 48 : 12;
      // At a blocker, advance to the next free space in the chosen direction.
      move(
        card,
        { x: box.x + step * delta[0], y: box.y + step * delta[1] },
        (x, y) => (x - box.x) * delta[0] + (y - box.y) * delta[1] >= 1,
      );
      remember(card);
      handle.scrollIntoView({ block: "nearest" });
    };
  }
  return schedule;
}
