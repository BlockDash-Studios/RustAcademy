import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async getPublicProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                walletAddress: true,
                displayName: true,
                bio: true,
                avatarUrl: true,
                specialties: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw new NotFoundException(`User profile with ID ${userId} not found`);
        }

        return user;
    }

    async updateProfile(userId: string, dto: UpdateProfileDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(dto.displayName && { displayName: dto.displayName }),
                ...(dto.bio !== undefined && { bio: dto.bio }),
                ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
                ...(dto.specialties && { specialties: dto.specialties }),
            },
            select: {
                id: true,
                walletAddress: true,
                displayName: true,
                bio: true,
                avatarUrl: true,
                specialties: true,
                updatedAt: true,
            },
        });
    }
}