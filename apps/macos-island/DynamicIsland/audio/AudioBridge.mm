/* Objective-C++ implementation bridging AudioProcessor to Swift. */

#import "AudioBridge.h"
#import "AudioProcessor.hpp"

@implementation AudioBridge {
    AudioProcessor *processor;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        processor = new AudioProcessor();
    }
    return self;
}

- (void)processBuffer:(const float *)buffer count:(int)count {
    processor->process(buffer, count);
}

- (NSArray<NSNumber *> *)getSmoothedMagnitudes {
    int count = processor->getBandCount();
    NSMutableArray<NSNumber *> *magnitudes = [NSMutableArray arrayWithCapacity:count];
    for (int i = 0; i < count; i++) {
        [magnitudes addObject:@(processor->getBand(i))];
    }
    return magnitudes;
}

- (int)getBandCount {
    return processor->getBandCount();
}

- (void)dealloc {
    delete processor;
}

@end
