import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';

describe('CoursesService enrollment', () => {
  let courses: CoursesService;

  beforeEach(() => {
    courses = new CoursesService();
    courses.create({ courseId: 'intro', title: 'Intro', capacity: 1, prerequisiteIds: [] });
    courses.create({ courseId: 'advanced', title: 'Advanced', capacity: 1, prerequisiteIds: ['intro'] });
    courses.createTask('intro', 'first-task');
  });

  it('requires completion of all prerequisites, not merely enrollment', () => {
    expect(() => courses.enroll('advanced', 'alice')).toThrow(BadRequestException);
    courses.enroll('intro', 'alice');
    expect(() => courses.enroll('advanced', 'alice')).toThrow(BadRequestException);
    courses.complete('intro', 'alice');
    expect(courses.enroll('advanced', 'alice').state).toBe('active');
  });

  it('enforces capacity, releases a seat on withdrawal, and permits re-enrollment', () => {
    courses.enroll('intro', 'alice');
    expect(() => courses.enroll('intro', 'alice')).toThrow(ConflictException);
    expect(() => courses.enroll('intro', 'bob')).toThrow(ConflictException);
    courses.withdraw('intro', 'alice');
    expect(courses.enroll('intro', 'bob').state).toBe('active');
    courses.withdraw('intro', 'bob');
    expect(courses.enroll('intro', 'alice').state).toBe('active');
  });

  it('allows transitions only from active and keeps completion terminal', () => {
    expect(() => courses.withdraw('intro', 'alice')).toThrow(ConflictException);
    courses.enroll('intro', 'alice');
    courses.withdraw('intro', 'alice');
    expect(() => courses.complete('intro', 'alice')).toThrow(ConflictException);
    courses.enroll('intro', 'alice');
    courses.complete('intro', 'alice');
    expect(() => courses.enroll('intro', 'alice')).toThrow(ConflictException);
    expect(() => courses.withdraw('intro', 'alice')).toThrow(ConflictException);
  });

  it('rejects task submissions until actively enrolled, including after withdrawal', () => {
    const submit = () => courses.submit('intro', 'first-task', { userId: 'alice', submissionId: 's1' });
    expect(submit).toThrow(BadRequestException);
    courses.enroll('intro', 'alice');
    expect(submit().taskId).toBe('first-task');
    expect(submit).toThrow(ConflictException);
    courses.withdraw('intro', 'alice');
    expect(() => courses.submit('intro', 'first-task', { userId: 'alice', submissionId: 's2' }))
      .toThrow(BadRequestException);
    expect(() => courses.submit('intro', 'missing', { userId: 'alice', submissionId: 's3' }))
      .toThrow(NotFoundException);
  });

  it('rejects invalid course capacity and prerequisite cycles through self-reference', () => {
    expect(() => courses.create({ courseId: 'bad', title: 'Bad', capacity: 0, prerequisiteIds: [] }))
      .toThrow(BadRequestException);
    expect(() => courses.create({ courseId: 'self', title: 'Self', capacity: 1, prerequisiteIds: ['self'] }))
      .toThrow(BadRequestException);
  });
});
