import { validate } from 'class-validator';
import { CreateCourseDto } from './create-course.dto';
import { UpdateCourseDto } from './update-course.dto';
import { CourseLevel } from '../interfaces/course-level.enum';

describe('CreateCourseDto validation (BA-047)', () => {
  const valid = () => {
    const dto = new CreateCourseDto();
    Object.assign(dto, {
      title: 'Rust Basics',
      description: 'An intro to Rust.',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 60,
      category: 'blockchain',
      categories: ['blockchain'],
      tags: ['ownership'],
      prerequisites: ['borrowing'],
      skills: ['memory-safety'],
    });
    return dto;
  };

  it('accepts a valid payload', async () => {
    expect(await validate(valid())).toEqual([]);
  });

  it('rejects a title that is too short', async () => {
    const dto = valid();
    dto.title = 'Ru';
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects an over-long title', async () => {
    const dto = valid();
    dto.title = 'x'.repeat(121);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects a blank required field', async () => {
    const dto = valid();
    dto.description = '';
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('rejects an out-of-enum level', async () => {
    const dto = valid();
    dto.level = 'extreme' as CourseLevel;
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'level')).toBe(true);
  });

  it('rejects blank taxonomy items in skills', async () => {
    const dto = valid();
    dto.skills = [''];
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'skills')).toBe(true);
  });

  it('rejects an over-long taxonomy item in tags', async () => {
    const dto = valid();
    dto.tags = ['x'.repeat(61)];
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'tags')).toBe(true);
  });

  it('rejects taxonomy arrays that exceed the max item count', async () => {
    const dto = valid();
    dto.skills = Array.from({ length: 21 }, (_, i) => `skill-${i}`);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'skills')).toBe(true);
  });
});

describe('UpdateCourseDto validation (BA-047)', () => {
  it('accepts a valid partial payload', async () => {
    const dto = new UpdateCourseDto();
    Object.assign(dto, { title: 'Rust Basics', skills: ['mem'] });
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects a title that is too short on update', async () => {
    const dto = new UpdateCourseDto();
    Object.assign(dto, { title: 'Ru' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects an over-long taxonomy item in categories on update', async () => {
    const dto = new UpdateCourseDto();
    Object.assign(dto, { categories: ['c'.repeat(61)] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'categories')).toBe(true);
  });
});