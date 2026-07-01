import { Request, Response } from 'express';
import { learningPathService } from './service';

export class LearningPathController {
  /**
   * GET /api/courses/learning-paths
   * Get all learning paths with full metadata
   */
  async getAllLearningPaths(req: Request, res: Response): Promise<void> {
    try {
      const paths = learningPathService.getAllLearningPaths();
      
      res.status(200).json({
        success: true,
        data: paths,
        count: paths.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch learning paths',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/courses/learning-paths/:id
   * Get a specific learning path by ID
   */
  async getLearningPathById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const path = learningPathService.getLearningPathById(id);

      if (!path) {
        res.status(404).json({
          success: false,
          error: 'Learning path not found',
          message: `No learning path found with ID: ${id}`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: path
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch learning path',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/courses/learning-paths/track/:track
   * Get learning paths by track (beginner, intermediate, advanced)
   */
  async getLearningPathsByTrack(req: Request, res: Response): Promise<void> {
    try {
      const { track } = req.params;
      
      if (!['beginner', 'intermediate', 'advanced'].includes(track)) {
        res.status(400).json({
          success: false,
          error: 'Invalid track parameter',
          message: 'Track must be: beginner, intermediate, or advanced'
        });
        return;
      }

      const paths = learningPathService.getLearningPathsByTrack(track as 'beginner' | 'intermediate' | 'advanced');

      res.status(200).json({
        success: true,
        data: paths,
        track: track,
        count: paths.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch learning paths by track',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/courses/learning-paths/summary
   * Get lightweight summary of all learning paths
   */
  async getLearningPathSummary(req: Request, res: Response): Promise<void> {
    try {
      const summary = learningPathService.getLearningPathSummary();

      res.status(200).json({
        success: true,
        data: summary,
        count: summary.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch learning path summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/courses/learning-paths/recommendation/:currentLevel
   * Get the next recommended learning path
   */
  async getNextPathRecommendation(req: Request, res: Response): Promise<void> {
    try {
      const { currentLevel } = req.params;
      
      if (!['beginner', 'intermediate', 'advanced'].includes(currentLevel)) {
        res.status(400).json({
          success: false,
          error: 'Invalid level parameter',
          message: 'Level must be: beginner, intermediate, or advanced'
        });
        return;
      }

      const nextPath = learningPathService.getNextPathRecommendation(
        currentLevel as 'beginner' | 'intermediate' | 'advanced'
      );

      if (!nextPath) {
        res.status(200).json({
          success: true,
          data: null,
          message: 'You are already at the most advanced level'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: nextPath,
        currentLevel,
        nextLevel: nextPath.track
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get recommendation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const learningPathController = new LearningPathController();