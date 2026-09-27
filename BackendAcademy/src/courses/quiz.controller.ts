import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { QuizService } from './quiz.service';
import { Quiz } from './quiz.types';

@ApiTags('quizzes')
@Controller('v1/quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post()
  @ApiOperation({ summary: 'Create a quiz (multiple choice / fill-in-the-blank) for a lesson' })
  create(@Body() dto: CreateQuizDto) {
    return this.quizService.createQuiz(dto as Quiz);
  }

  @Get(':quizId')
  @ApiOperation({ summary: 'Get a quiz definition' })
  getQuiz(@Param('quizId') quizId: string) {
    return this.quizService.getQuiz(quizId);
  }

  @Post(':quizId/attempts')
  @ApiOperation({ summary: 'Submit an attempt; auto-graded instantly against attempt limits' })
  submitAttempt(@Param('quizId') quizId: string, @Body() dto: SubmitAttemptDto) {
    return this.quizService.submitAttempt(quizId, dto.userId, dto.answers);
  }

  @Get(':quizId/attempts/:userId')
  @ApiOperation({ summary: 'Get a user attempt history and best score for a quiz' })
  getAttempts(@Param('quizId') quizId: string, @Param('userId') userId: string) {
    return {
      quizId,
      userId,
      attempts: this.quizService.getAttempts(quizId, userId),
      bestScore: this.quizService.getBestScore(quizId, userId),
    };
  }
}
