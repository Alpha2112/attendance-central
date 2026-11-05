import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'superadmin@techive.local' })
  email!: string;

  @ApiProperty({ example: 'ChangeMe#123' })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  newPassword!: string;
}
