export interface AcMatch {
  keyword: string;
  start: number;
  end: number;
}

interface AcNode {
  children: Map<string, AcNode>;
  fail: AcNode | null;
  outputs: string[];
}

export class AhoCorasick {
  private readonly root: AcNode = {
    children: new Map(),
    fail: null,
    outputs: [],
  };

  constructor(keywords: string[]) {
    this.buildTrie(keywords);
    this.buildFailurePointers();
  }

  private buildTrie(keywords: string[]): void {
    for (const word of keywords) {
      const trimmed = word.trim();
      if (!trimmed) continue;
      let curr = this.root;
      for (const char of trimmed) {
        let child = curr.children.get(char);
        if (!child) {
          child = { children: new Map(), fail: null, outputs: [] };
          curr.children.set(char, child);
        }
        curr = child;
      }
      curr.outputs.push(trimmed);
    }
  }

  private buildFailurePointers(): void {
    const queue: AcNode[] = [];

    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;

      for (const [char, child] of curr.children.entries()) {
        let fallback = curr.fail;
        while (fallback !== null && !fallback.children.has(char)) {
          fallback = fallback.fail;
        }
        child.fail = fallback ? fallback.children.get(char)! : this.root;
        if (child.fail.outputs.length > 0) {
          child.outputs.push(...child.fail.outputs);
        }
        queue.push(child);
      }
    }
  }

  public search(text: string): AcMatch[] {
    const results: AcMatch[] = [];
    if (!text) return results;

    let curr: AcNode | null = this.root;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      while (curr !== null && !curr.children.has(char)) {
        curr = curr.fail;
      }
      if (curr === null) {
        curr = this.root;
        continue;
      }
      curr = curr.children.get(char)!;
      if (curr.outputs.length > 0) {
        for (const kw of curr.outputs) {
          results.push({
            keyword: kw,
            start: i - kw.length + 1,
            end: i + 1,
          });
        }
      }
    }

    return results;
  }
}
