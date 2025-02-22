import { CACHE_MANAGER, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Cache } from 'cache-manager';

import {
  CacheOnIntervalOptions,
  CACHE_ON_INTERVAL_KEY,
  CACHE_ON_INTERVAL_TIMEOUT,
} from './cache-on-interval.decorator';

@Injectable()
export class CacheOnIntervalService implements OnModuleInit, OnModuleDestroy {
  private readonly intervals: NodeJS.Timer[] = [];
  private readonly registeredCacheKeys: string[] = [];
  private logger = new Logger(CacheOnIntervalService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(DiscoveryService) private readonly discoveryService: DiscoveryService,
    @Inject(MetadataScanner) private readonly metadataScanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    const instanceWrappers = this.discoveryService.getProviders();
    instanceWrappers
      .filter(wrapper => wrapper.isDependencyTreeStatic() && !!wrapper.instance)
      .forEach(wrapper => {
        this.metadataScanner.scanFromPrototype(
          wrapper.instance,
          Object.getPrototypeOf(wrapper.instance),
          (methodName: string) => {
            this.registerCache(wrapper.instance, methodName);
          },
        );
      });
  }

  onModuleDestroy() {
    this.intervals.forEach(interval => clearInterval(interval));
  }

  private checkCacheConflicts(cacheKey: string) {
    if (this.registeredCacheKeys.includes(cacheKey)) {
      throw new Error(`Cache conflict found for key "${cacheKey}"`);
    }

    this.registeredCacheKeys.push(cacheKey);
  }

  private registerCache(instance: any, methodName: string) {
    const logger = this.logger;
    const methodRef = instance[methodName];
    const cacheKey: CacheOnIntervalOptions['key'] = this.reflector.get(CACHE_ON_INTERVAL_KEY, methodRef);
    const cacheTimeout: CacheOnIntervalOptions['timeout'] = this.reflector.get(CACHE_ON_INTERVAL_TIMEOUT, methodRef);
    const ttl = Math.floor(cacheTimeout / 1000);

    // Don't register cache on interval when missing parameters
    if (!cacheKey || !cacheTimeout) return;

    // Don't register cache on cache conflict
    try {
      this.checkCacheConflicts(cacheKey);
    } catch (e) {
      this.logger.error(e.message);
    }

    // Service references
    const cacheManager = this.cacheManager;

    // Augment the method to be cached with caching mechanism
    instance[methodName] = async function (...args: any[]) {
      const cachedValue = await cacheManager.get(cacheKey);

      if (cachedValue) {
        return cachedValue;
      } else {
        try {
          const liveData = await methodRef.apply(instance, args);
          await cacheManager.set(cacheKey, liveData, { ttl });
          return liveData;
        } catch (e) {
          logger.error(`@CacheOnInterval error for ${instance.constructor.name}#${methodName}`, e);
        }
      }
    };

    // Save the interval
    const interval = setInterval(async () => {
      try {
        const liveData = await methodRef.apply(instance);
        await cacheManager.set(cacheKey, liveData, { ttl });
      } catch (e) {
        logger.error(`@CacheOnInterval error for ${instance.constructor.name}#${methodName}`, e);
      }
    }, cacheTimeout);
    this.intervals.push(interval);
  }
}
