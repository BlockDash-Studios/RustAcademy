import { IsString, IsNotEmpty, IsUrl, MaxLength } from 'class-validator';

export class TutorApplicationDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    statementOfExpertise: string;

    @IsUrl()
    @IsNotEmpty()
    sampleLessonUrl: string;
}