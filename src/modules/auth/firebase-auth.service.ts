import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const FIREBASE_PROJECT_ID = 'srithathwamasiayyappa-6a56f';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDWLl90R09PLwdgk9gT6TfsdTPRqaQFAec';

export interface VerifiedFirebaseIdentity {
  uid: string;
  phoneNumber: string;
  cleanPhone: string;
}

@Injectable()
export class FirebaseAuthService {
  private firebaseApp: App;

  constructor(private readonly prisma: PrismaService) {
    if (getApps().length === 0) {
      this.firebaseApp = initializeApp({
        projectId: FIREBASE_PROJECT_ID,
      });
    } else {
      this.firebaseApp = getApps()[0];
    }
  }

  /**
   * Cryptographically verify Firebase Phone Auth ID Token
   * 1. Requires valid, signed Firebase ID token
   * 2. Checks issuer: https://securetoken.google.com/srithathwamasiayyappa-6a56f
   * 3. Checks audience: srithathwamasiayyappa-6a56f
   * 4. Enforces verified phone_number claim
   * 5. Fallback verification via Google Identity Toolkit REST API
   */
  async verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseIdentity> {
    if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
      throw new BadRequestException('Firebase ID token is required for authentication.');
    }

    const cleanToken = idToken.trim();

    // 1. Primary: Verify via Firebase Admin SDK (Strict Production Cryptographic Verification)
    try {
      const auth = getAuth(this.firebaseApp);
      const decoded = await auth.verifyIdToken(cleanToken);

      if (!decoded.phone_number) {
        throw new UnauthorizedException('Firebase identity does not contain a verified phone number.');
      }

      const cleanPhone = decoded.phone_number.replace(/[^0-9]/g, '').slice(-10);
      return {
        uid: decoded.uid,
        phoneNumber: decoded.phone_number,
        cleanPhone,
      };
    } catch (adminErr: any) {
      if (adminErr instanceof UnauthorizedException || adminErr instanceof BadRequestException) {
        throw adminErr;
      }

      // 2. Secondary: Fallback to Google Identity Toolkit accounts:lookup REST API
      try {
        const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
        const res = await fetch(lookupUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: cleanToken }),
        });

        if (!res.ok) {
          throw new UnauthorizedException('Invalid, revoked, or expired Firebase identity token.');
        }

        const data = await res.json();
        const user = data.users?.[0];

        if (!user || !user.localId) {
          throw new UnauthorizedException('No valid Firebase devotee identity returned.');
        }

        if (!user.phoneNumber) {
          throw new UnauthorizedException('Firebase identity does not contain a verified phone number.');
        }

        const cleanPhone = user.phoneNumber.replace(/[^0-9]/g, '').slice(-10);
        return {
          uid: user.localId,
          phoneNumber: user.phoneNumber,
          cleanPhone,
        };
      } catch (restErr: any) {
        if (restErr instanceof UnauthorizedException) throw restErr;
        throw new ServiceUnavailableException('Firebase identity verification service is unreachable.');
      }
    }
  }

  /**
   * Process authenticated Firebase Phone sign-in or registration
   * - Enforces strict LOGIN vs REGISTER policies
   * - Enforces account suspension checks
   * - Persists verified identity to MariaDB
   */
  async authenticateWithFirebasePhone(params: {
    idToken: string;
    intent: 'LOGIN' | 'REGISTER';
    fullName?: string;
    preferredLang?: string;
  }) {
    const { idToken, intent, fullName, preferredLang } = params;

    // 1. Verify token & extract cryptographically signed identity
    const verified = await this.verifyFirebaseIdToken(idToken);
    const { uid, cleanPhone } = verified;

    // 2. Query MariaDB for existing user
    const existingUser = await this.prisma.appUser.findFirst({
      where: {
        OR: [
          { phoneNumber: cleanPhone },
          { phoneNumber: `+91${cleanPhone}` },
          { phoneNumber: `91${cleanPhone}` },
          { deviceUuid: `firebase:${uid}` },
        ],
      },
    });

    // 3. Apply REGISTER Intent Policy: Strictly prevent duplicate registration
    if (intent === 'REGISTER') {
      if (existingUser) {
        throw new BadRequestException('This mobile number is already registered. Please login.');
      }

      const nameToStore = (fullName && fullName.trim()) ? fullName.trim() : 'Devotee';
      try {
        const newUser = await this.prisma.appUser.create({
          data: {
            phoneNumber: cleanPhone,
            fullName: nameToStore,
            deviceUuid: `firebase:${uid}`,
            preferredLang: preferredLang || 'en',
            lastActiveAt: new Date(),
          },
        });

        return {
          success: true,
          message: 'Account registered successfully! Welcome to Saranam Ayyappa.',
          user: {
            id: newUser.id,
            phoneNumber: newUser.phoneNumber,
            fullName: newUser.fullName,
            email: newUser.email,
            preferredLang: newUser.preferredLang,
            profileOnboardingStatus: newUser.profileOnboardingStatus,
          },
        };
      } catch (err: any) {
        if (err.code === 'P2002') {
          throw new BadRequestException('This mobile number is already registered. Please proceed to login.');
        }
        throw new BadRequestException('Registration could not be completed. Please try again.');
      }
    }

    // 4. Apply LOGIN Intent Policy
    if (!existingUser) {
      throw new UnauthorizedException('This mobile number is not registered. Please register your account first.');
    }

    if (existingUser.isSuspended) {
      throw new UnauthorizedException('Your devotee account is currently suspended. Please contact temple administration.');
    }

    // Update active timestamp and link Firebase UID if needed
    const updatedUser = await this.prisma.appUser.update({
      where: { id: existingUser.id },
      data: {
        lastActiveAt: new Date(),
        deviceUuid: existingUser.deviceUuid || `firebase:${uid}`,
      },
    });

    return {
      success: true,
      message: 'Login successful! Welcome to Saranam Ayyappa.',
      user: {
        id: updatedUser.id,
        phoneNumber: updatedUser.phoneNumber,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        preferredLang: updatedUser.preferredLang,
        profileOnboardingStatus: updatedUser.profileOnboardingStatus,
      },
    };
  }
}
