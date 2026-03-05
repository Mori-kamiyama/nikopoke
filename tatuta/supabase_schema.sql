-- Create moves table
CREATE TABLE moves (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  category TEXT,
  pp INTEGER,
  power INTEGER,
  accuracy NUMERIC,
  priority INTEGER DEFAULT 0,
  description TEXT,
  tags TEXT[],
  steps JSONB,
  extra_data JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for searching
CREATE INDEX idx_moves_name ON moves USING GIN (to_tsvector('simple', name));
CREATE INDEX idx_moves_type ON moves (type);
CREATE INDEX idx_moves_id ON moves (id);

-- Enable Row Level Security (RLS)
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read
CREATE POLICY "Allow public read access" ON moves FOR SELECT USING (true);

-- Create policy to allow authenticated users to update (or just public for now if requested, but better keep it safe)
-- CREATE POLICY "Allow public update access" ON moves FOR UPDATE USING (true);
