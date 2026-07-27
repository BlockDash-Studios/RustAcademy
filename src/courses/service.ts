import { learningPaths, LearningPathMetadata } from './data/learningPaths';

const LEVEL_ORDER: Record<string, string> = {
  beginner: 'intermediate',
  intermediate: 'advanced',
  advanced: '',
};

class LearningPathService {
  getAllLearningPaths(): LearningPathMetadata[] {
    return learningPaths;
  }

  getLearningPathById(id: string): LearningPathMetadata | undefined {
    return learningPaths.find((p) => p.id === id);
  }

  getLearningPathsByTrack(track: 'beginner' | 'intermediate' | 'advanced'): LearningPathMetadata[] {
    return learningPaths.filter((p) => p.track === track);
  }

  getLearningPathSummary(): Array<{ id: string; track: string; title: string; difficulty: number; price: number }> {
    return learningPaths.map((p) => ({
      id: p.id,
      track: p.track,
      title: p.title,
      difficulty: p.difficulty,
      price: p.price.amount,
    }));
  }

  getNextPathRecommendation(currentLevel: 'beginner' | 'intermediate' | 'advanced'): LearningPathMetadata | null {
    if (!['beginner', 'intermediate', 'advanced'].includes(currentLevel)) {
      return null;
    }

    const nextLevel = LEVEL_ORDER[currentLevel];
    if (!nextLevel) {
      return null;
    }

    const nextPath = learningPaths.find((p) => p.track === nextLevel);
    return nextPath || null;
  }
}

export const learningPathService = new LearningPathService();