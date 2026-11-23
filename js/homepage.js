import { onHomepageChange, readHomepage } from "./homepage-options.js";
import { widgetLayout } from "./widget-layout.js";

const prefix = "startpage.widgets.";
function read(key, fallback) {
  const raw = localStorage.getItem(prefix + key);
  if (raw === null) return fallback;
  return JSON.parse(raw);
}
function write(key, value) {
  localStorage.setItem(prefix + key, JSON.stringify(value));
}
function localDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function homepage(notice) {
  const layer = document.querySelector("#widgets");
  const todos = document.querySelector("#todo-widget");
  const notes = document.querySelector("#notes-widget");
  const textarea = document.querySelector("#home-notes");
  const form = document.querySelector("#reminder-form");
  const list = document.querySelector("#reminders");
  const wallpaper = document.querySelector("#home-wallpaper");
  let photoId,
    photoURL,
    revision = 0,
    dayTimer;

  const arrange = widgetLayout(
    layer,
    (key) => {
      try {
        const pos = read(key, null);
        return Number.isFinite(pos?.x) && Number.isFinite(pos?.y) ? pos : null;
      } catch {
        return null;
      }
    },
    (key, pos) => {
      try {
        write(key, pos);
      } catch {
        notice("Could not save this widget position on this device.");
      }
    },
  );

  function showNotes() {
    const value = read("notes", "");
    if (typeof value === "string" && textarea.value !== value)
      textarea.value = value;
  }
  textarea.oninput = () => {
    try {
      write("notes", textarea.value);
    } catch {
      notice("Could not save this note. Your text is still in the editor.");
    }
  };

  function showTasks() {
    const tasks = read("tasks", []);
    if (!Array.isArray(tasks)) throw Error("Unreadable reminder list");
    const now = new Date(),
      today = localDate(now);
    const focused = document.activeElement;
    const activeRow = focused.closest(".reminder-row");
    const rows = document.createDocumentFragment();
    for (const task of tasks) {
      const row = document.createElement("li");
      row.className = "reminder-row";
      row.dataset.id = task.id;
      const label = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = task.done;
      const text = document.createElement("span");
      text.textContent = task.text;
      if (task.due) {
        const due = document.createElement("time");
        due.dateTime = task.due;
        const date = new Date(task.due + "T12:00:00");
        const formatted = date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
        });
        due.textContent =
          task.due === today
            ? "Due today"
            : (task.due < today && !task.done ? "Overdue · " : "Due ") +
              formatted;
        due.classList.toggle("due-now", task.due <= today && !task.done);
        text.append(due);
      }
      label.append(check, text);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Delete reminder: " + task.text);
      row.append(label, remove);
      rows.append(row);
    }
    list.replaceChildren(rows);
    if (activeRow) {
      const same = [...list.children].find(
        (row) => row.dataset.id === activeRow.dataset.id,
      );
      (same?.querySelector(focused.tagName) || form.elements.task).focus({
        preventScroll: true,
      });
    }
    clearTimeout(dayTimer);
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    if (!document.hidden && !todos.hidden)
      dayTimer = setTimeout(refreshTasks, tomorrow - now);
  }
  function refreshTasks() {
    try {
      showTasks();
    } catch {
      notice("Could not read the reminders on this device.");
    }
  }
  async function updateTasks(change) {
    try {
      await navigator.locks.request(prefix + "tasks", () => {
        const tasks = read("tasks", []);
        write("tasks", change(tasks));
      });
      showTasks();
      return true;
    } catch {
      notice("Could not save that reminder on this device.");
      refreshTasks();
      return false;
    }
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    const text = form.elements.task.value.trim();
    const due = form.elements.due.value;
    if (!text || form.querySelector("button").disabled) return;
    const task = { id: crypto.randomUUID(), text, due, done: false };
    const submit = form.querySelector("button");
    submit.disabled = true;
    const saved = await updateTasks((tasks) => [...tasks, task]);
    submit.disabled = false;
    if (
      saved &&
      form.elements.task.value.trim() === text &&
      form.elements.due.value === due
    )
      form.reset();
    form.elements.task.focus();
  };
  list.onchange = (event) => {
    const id = event.target.closest("li").dataset.id;
    const done = event.target.checked;
    updateTasks((tasks) =>
      tasks.map((task) => (task.id === id ? { ...task, done } : task)),
    );
  };
  list.onclick = (event) => {
    const button = event.target.closest("button");
    if (button)
      updateTasks((tasks) =>
        tasks.filter((task) => task.id !== button.closest("li").dataset.id),
      );
  };

  async function load() {
    const current = ++revision;
    try {
      const saved = await readHomepage();
      if (revision !== current) return;
      todos.hidden = !saved.todos;
      notes.hidden = !saved.notes;
      layer.hidden = todos.hidden && notes.hidden;
      if (saved.wallpaper?.id !== photoId) {
        const oldURL = photoURL;
        photoId = saved.wallpaper?.id;
        photoURL = saved.wallpaper && URL.createObjectURL(saved.wallpaper.blob);
        wallpaper.style.backgroundImage = photoURL
          ? 'url("' + photoURL + '")'
          : "";
        wallpaper.hidden = !photoURL;
        document.body.toggleAttribute("data-wallpaper", !!photoURL);
        if (oldURL) URL.revokeObjectURL(oldURL);
      }
      arrange();
      clearTimeout(dayTimer);
      if (!todos.hidden) refreshTasks();
      if (!notes.hidden) showNotes();
    } catch {
      notice("Homepage storage is unavailable on this device.");
    }
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    if (!notes.hidden && (!event.key || event.key === prefix + "notes")) {
      try {
        showNotes();
      } catch {
        notice("Could not read the saved note.");
      }
    }
    if (!todos.hidden && (!event.key || event.key === prefix + "tasks"))
      refreshTasks();
    if (!event.key || event.key.endsWith("-widget")) arrange();
  });
  document.addEventListener("visibilitychange", () => {
    clearTimeout(dayTimer);
    if (!document.hidden && !todos.hidden) refreshTasks();
  });
  onHomepageChange(load);
  load();
}
