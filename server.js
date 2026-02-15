const path = require("path");
const Database = require("better-sqlite3");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "meals.db"));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ALLOWED_SORT_FIELDS = {
  name: "name",
  category: "category",
  lastCooked: "last_cooked",
  timesCooked: "times_cooked",
};

const ALLOWED_CATEGORIES = new Set(["meat", "vegetarian", "fish"]);

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('meat', 'vegetarian', 'fish')),
      last_cooked TEXT NOT NULL,
      times_cooked INTEGER NOT NULL DEFAULT 0
    );
  `);

  const mealCount = db.prepare("SELECT COUNT(*) as count FROM meals").get().count;
  if (mealCount > 0) {
    return;
  }

  const seedMeals = [
    { name: "Kottbullar med potatismos", category: "meat", lastCooked: "2026-01-02", timesCooked: 15 },
    { name: "Pannbiff med loksas", category: "meat", lastCooked: "2026-01-19", timesCooked: 8 },
    { name: "Falukorv i ugn", category: "meat", lastCooked: "2026-01-11", timesCooked: 12 },
    { name: "Raggmunk med flask", category: "meat", lastCooked: "2025-12-21", timesCooked: 6 },
    { name: "Ugnsbakad lax med potatis", category: "fish", lastCooked: "2026-01-27", timesCooked: 10 },
    { name: "Fiskgratang", category: "fish", lastCooked: "2026-02-03", timesCooked: 5 },
    { name: "Artsoppa och pannkakor", category: "meat", lastCooked: "2026-01-30", timesCooked: 4 },
    { name: "Vegetarisk pytt i panna", category: "vegetarian", lastCooked: "2026-01-24", timesCooked: 7 },
    { name: "Kikartsgryta med ris", category: "vegetarian", lastCooked: "2026-01-08", timesCooked: 9 },
    { name: "Rotfruktssoppa med brod", category: "vegetarian", lastCooked: "2025-12-28", timesCooked: 11 },
  ];

  const insertMeal = db.prepare(`
    INSERT INTO meals (name, category, last_cooked, times_cooked)
    VALUES (@name, @category, @lastCooked, @timesCooked)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insertMeal.run(row);
    }
  });

  insertMany(seedMeals);
}

initializeDatabase();

function mapMeal(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    lastCooked: row.last_cooked,
    timesCooked: row.times_cooked,
  };
}

app.get("/api/meals", (req, res) => {
  const sortBy = ALLOWED_SORT_FIELDS[req.query.sortBy] || ALLOWED_SORT_FIELDS.lastCooked;
  const order = req.query.order === "desc" ? "DESC" : "ASC";

  const rows = db
    .prepare(
      `SELECT id, name, category, last_cooked, times_cooked
       FROM meals
       ORDER BY ${sortBy} ${order}, id ASC`
    )
    .all();

  res.json(rows.map(mapMeal));
});

app.post("/api/meals", (req, res) => {
  const { name, category, lastCooked, timesCooked } = req.body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "Name must be at least 2 characters." });
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    return res.status(400).json({ error: "Category must be meat, vegetarian, or fish." });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastCooked)) {
    return res.status(400).json({ error: "lastCooked must be in YYYY-MM-DD format." });
  }

  const parsedTimesCooked = Number(timesCooked);
  if (!Number.isInteger(parsedTimesCooked) || parsedTimesCooked < 0) {
    return res.status(400).json({ error: "timesCooked must be a non-negative integer." });
  }

  const result = db
    .prepare(
      `INSERT INTO meals (name, category, last_cooked, times_cooked)
       VALUES (?, ?, ?, ?)`
    )
    .run(name.trim(), category, lastCooked, parsedTimesCooked);

  const created = db
    .prepare("SELECT id, name, category, last_cooked, times_cooked FROM meals WHERE id = ?")
    .get(result.lastInsertRowid);

  return res.status(201).json(mapMeal(created));
});

app.post("/api/meals/:id/cooked-today", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid meal id." });
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = db
    .prepare(
      `UPDATE meals
       SET last_cooked = ?, times_cooked = times_cooked + 1
       WHERE id = ?`
    )
    .run(today, id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Meal not found." });
  }

  const updated = db
    .prepare("SELECT id, name, category, last_cooked, times_cooked FROM meals WHERE id = ?")
    .get(id);

  return res.json(mapMeal(updated));
});

app.patch("/api/meals/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid meal id." });
  }

  const { name } = req.body;
  if (typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "Name must be at least 2 characters." });
  }

  const result = db
    .prepare(
      `UPDATE meals
       SET name = ?
       WHERE id = ?`
    )
    .run(name.trim(), id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Meal not found." });
  }

  const updated = db
    .prepare("SELECT id, name, category, last_cooked, times_cooked FROM meals WHERE id = ?")
    .get(id);

  return res.json(mapMeal(updated));
});

app.listen(port, () => {
  console.log(`Meal planner running at http://localhost:${port}`);
});
