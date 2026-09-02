#pragma once
#include <iostream>
#include <string>
#include "RTCManager.h"
#include <memory>


enum class PlayerRole{
    NONE,
    BATSMAN,
    BOWLER
};

class Player{
    public:
        Player(int id):playerId(id),role(PlayerRole::NONE){
            std::cout << "[Player] Naya Object Bana, ID : " << playerId << "\n";
        }
        ~Player(){
        std::cout << "[Player] Player Object Destroy Hua, ID: " << playerId  << "\n";
        }

        int playerId;
        Player* opponent = nullptr;
        PlayerRole role;
        std::string name;
        std::shared_ptr<RTCManager> rtc;


};