/**
 * Where a user's personal data lives across the API, for GDPR/CCPA access
 * and erasure requests.
 *
 * Erasure removes personal data that is not needed to operate escrow:
 * profiles, social activity, preferences and notifications are deleted;
 * pledges keep their (pseudonymous) wallet address but lose the backer's
 * display name. Escrow, payment, commemorative and security records are
 * retained for legal and accounting reasons and reported as retained.
 */

import { UserDataProvider } from "../compliance";
import { DataCategory, DeletionType } from "../compliance/types";
import {
  campaignsCreatedBy,
  getStore,
  pledgesByBacker,
} from "../database";
import { authService } from "../security/auth-service";
import { socialService } from "../social";
import { notificationService } from "../notifications";
import { notificationService as notificationServiceV2 } from "../notifications-v2";
import { translationService } from "../i18n";
import { commemorativeService } from "../tokens";
import { reportService } from "../reporting";
import { paymentProcessor } from "./routes/payments";

function securityEventsFor(address: string) {
  const user = address.toLowerCase();
  return authService
    .getSecurityEvents({ limit: Number.MAX_SAFE_INTEGER })
    .filter((e) => e.actor?.address?.toLowerCase() === user);
}

export const apiUserData: UserDataProvider = {
  async exportCategory(address: string, category: DataCategory): Promise<unknown> {
    switch (category) {
      case "profile":
        return {
          address,
          roles: authService.getUserRoles(address),
          profile: socialService.exportUser(address).profile,
        };
      case "campaigns":
        return campaignsCreatedBy(address);
      case "pledges":
        return pledgesByBacker(address);
      case "transactions":
        return {
          escrow: await reportService.getTransactionHistory(address),
          payments: paymentProcessor.listCheckoutsForBacker(address),
        };
      case "commemoratives":
        return commemorativeService.getByBackerAddress(address);
      case "social": {
        const { profile: _profile, ...social } = socialService.exportUser(address);
        return social;
      }
      case "preferences":
        return {
          notifications: notificationService.exportUser(address).preferences,
          notificationChannels: notificationServiceV2.exportUser(address).preferences,
          locale: translationService.exportUser(address),
        };
      case "communications":
        return {
          notifications: notificationService.exportUser(address).notifications,
          messages: notificationServiceV2.exportUser(address).notifications,
          inbox: notificationServiceV2.exportUser(address).inApp,
        };
      case "audit_log":
        return securityEventsFor(address);
      default:
        return null;
    }
  },

  async eraseCategory(address: string, category: DataCategory, type: DeletionType) {
    const result = { deleted: 0, anonymized: 0, retained: 0 };

    switch (category) {
      case "profile":
      case "social": {
        const social = socialService.eraseUser(address, type === "full_delete" ? "delete" : "anonymize");
        result.deleted += social.deleted;
        result.anonymized += social.anonymized;
        if (category === "profile" && type === "full_delete") {
          result.deleted += authService.revokeAllSessions(address);
        }
        break;
      }

      case "preferences":
      case "communications":
        result.deleted +=
          notificationService.eraseUser(address) +
          notificationServiceV2.eraseUser(address) +
          (category === "preferences" ? translationService.eraseUser(address) : 0);
        break;

      case "pledges": {
        // Escrow records stay; the backer's display name goes
        const pledges = await pledgesByBacker(address);
        for (const listed of pledges) {
          if (listed.backerName) {
            await getStore().transaction(async (tx) => {
              const pledge = await tx.getPledge(listed.id, { forUpdate: true });
              if (pledge?.backerName) {
                pledge.backerName = null;
                await tx.savePledge(pledge);
                result.anonymized++;
              }
            });
          }
        }
        result.retained += pledges.length;
        break;
      }

      case "campaigns":
        result.retained += (await campaignsCreatedBy(address)).length;
        break;
      case "transactions":
        result.retained +=
          (await reportService.getTransactionHistory(address)).length +
          paymentProcessor.listCheckoutsForBacker(address).length;
        break;
      case "commemoratives":
        result.retained += commemorativeService.getByBackerAddress(address).length;
        break;
      case "audit_log":
        result.retained += securityEventsFor(address).length;
        break;
    }

    return result;
  },
};
