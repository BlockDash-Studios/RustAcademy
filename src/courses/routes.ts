import { Router } from 'express';
import { learningPathController } from './controller';

const router = Router();

// GET /api/courses/learning-paths
router.get('/learning-paths', learningPathController.getAllLearningPaths.bind(learningPathController));

// GET /api/courses/learning-paths/:id
router.get('/learning-paths/:id', learningPathController.getLearningPathById.bind(learningPathController));

// GET /api/courses/learning-paths/track/:track
router.get('/learning-paths/track/:track', learningPathController.getLearningPathsByTrack.bind(learningPathController));

// GET /api/courses/learning-paths/summary
router.get('/learning-paths/summary', learningPathController.getLearningPathSummary.bind(learningPathController));

// GET /api/courses/learning-paths/recommendation/:currentLevel
router.get('/learning-paths/recommendation/:currentLevel', learningPathController.getNextPathRecommendation.bind(learningPathController));

export default router;