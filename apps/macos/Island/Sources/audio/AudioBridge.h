#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AudioBridge : NSObject

- (void)processBuffer:(const float *)buffer count:(int)count;
- (NSArray<NSNumber *> *)getSmoothedMagnitudes;
- (int)getBandCount;

@end

NS_ASSUME_NONNULL_END
