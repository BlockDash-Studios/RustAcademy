// src/modules/users/dto/update-profile.dto.ts
import { IsString, IsOptional, IsUrl, IsArray, MaxLength } from 'class-validator';

export class UpdateProfileDto {
    @IsString()
    @IsOptional()
    @MaxLength(50)
    displayName?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    bio?: string;

    @IsUrl()
    @IsOptional()
    avatarUrl?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    specialties?: string[];
}