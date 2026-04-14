import { EntityId } from './entity';

export class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private cells: EntityId[][];

  constructor(cellSize: number = 128, width: number = 1000, height: number = 700) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = [];
    }
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].length = 0;
    }
  }

  insert(id: EntityId, x: number, y: number, radius: number): void {
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        this.cells[r * this.cols + c].push(id);
      }
    }
  }

  queryArea(x: number, y: number, radius: number): EntityId[] {
    const result: EntityId[] = [];
    const seen = new Set<EntityId>();

    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const id = cell[i];
          if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
          }
        }
      }
    }
    return result;
  }

  queryPairs(callback: (a: EntityId, b: EntityId) => void): void {
    const seen = new Set<number>();

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      for (let a = 0; a < cell.length; a++) {
        for (let b = a + 1; b < cell.length; b++) {
          const idA = cell[a];
          const idB = cell[b];
          const key = idA < idB ? idA * 0x100000 + idB : idB * 0x100000 + idA;
          if (!seen.has(key)) {
            seen.add(key);
            callback(idA, idB);
          }
        }
      }
    }
  }
}
