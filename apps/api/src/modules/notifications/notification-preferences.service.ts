import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import {
  findPreferenceDefinition,
  PREFERENCE_DEFINITIONS,
} from './notification-preferences.constants';

export interface ResolvedPreference {
  key: string;
  channel: string;
  groupLabel: string;
  channelLabel: string;
  enabled: boolean;
  /** false for transactional channels the user is not allowed to turn off. */
  canDisable: boolean;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the full preference matrix for a user: every coded definition,
   * with the stored override applied where one exists and the coded default
   * otherwise. Rows the user has never touched are returned at their default
   * (no DB row required), so the settings page is always complete.
   */
  async getPreferences(userId: string): Promise<ResolvedPreference[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
      select: { channel: true, key: true, enabled: true },
    });
    const stored = new Map(rows.map((r) => [`${r.key}:${r.channel}`, r.enabled]));

    return PREFERENCE_DEFINITIONS.map((d) => ({
      key: d.key,
      channel: d.channel,
      groupLabel: d.groupLabel,
      channelLabel: d.channelLabel,
      // Transactional channels are always on regardless of any stale row.
      enabled: d.transactional ? true : (stored.get(`${d.key}:${d.channel}`) ?? d.defaultEnabled),
      canDisable: !d.transactional,
    }));
  }

  /**
   * Applies a batch of toggles. Silently drops:
   *   - unknown (key, channel) pairs not in the coded registry, and
   *   - attempts to DISABLE a transactional channel (it must stay on).
   * Enabling is always allowed. Upserts run in a single transaction so a
   * partial failure doesn't leave a half-applied set.
   */
  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<ResolvedPreference[]> {
    const valid = dto.preferences.filter((p) => {
      const def = findPreferenceDefinition(p.key, p.channel);
      if (!def) return false;
      if (def.transactional && !p.enabled) return false;
      return true;
    });

    if (valid.length > 0) {
      await this.prisma.$transaction(
        valid.map((p) =>
          this.prisma.notificationPreference.upsert({
            where: { userId_channel_key: { userId, channel: p.channel, key: p.key } },
            create: { userId, channel: p.channel, key: p.key, enabled: p.enabled },
            update: { enabled: p.enabled },
          }),
        ),
      );
    }

    return this.getPreferences(userId);
  }
}
