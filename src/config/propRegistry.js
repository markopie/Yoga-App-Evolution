export const PROP_REGISTRY = {
    bandage: {
        id: 'bandage',
        label: 'Therapeutic Bandage',
        icon: '🩹',
        color: '#d35400',
        audioCue: 'Wearing a bandage.',
        bannerTitle: 'Therapeutic Protocol: Head Bandage',
        bannerHtml: `A firmly tied bandage round the head is soothing for headaches. Wind bandage around the forehead and back of the skull. Pull firmly but not tight. 
                     <br><small><em>Eyestrain: cover eyes lightly 2-3 times at start.</em></small>`
    },
    block: {
        id: 'block',
        label: 'Block & Wall Support',
        icon: '🩹',
        color: '#007aff',
        audioCue: 'Use a block for hand and a wall for torso',
        bannerTitle: 'Therapeutic Protocol: Block & Wall Support',
        bannerHtml: `Core Instruction: Perform these asanas using a block for hand support rather than resting on the floor.<br>
                     Adjustment: Utilize varying block heights to maintain spinal alignment.<br>
                     Support: Use a wall or ledge to stabilize the torso.<br>
                     Leverage: If a ledge or brick is available, use it to lever into the pose with the free hand.<br><br>
                     <small><em>Benefit: This protocol focuses on freeing and stretching affected areas to improve mobility through controlled support.</em></small>`
    }
};

// Expose to window for zero-import modules like posePlayer and audioEngine
if (typeof window !== 'undefined') {
    window.PROP_REGISTRY = PROP_REGISTRY;
}